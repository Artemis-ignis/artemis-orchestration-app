import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  AI_PROVIDER_IDS,
  getProviderLabel,
  getProviderRegistry,
  getRoutingWeights,
  loadFreeModelRegistry,
  normalizeProviderId,
  normalizeRoutingMode,
  parseCandidateListInput,
} from './config.mjs'
import { createProviderAdapters, normalizeProviderError } from './providers.mjs'
import { createAiStorage, maskSecret } from './storage.mjs'

function nowIso() {
  return new Date().toISOString()
}

function failurePenaltyFor(candidate, failureMap, multiplier) {
  const failures = failureMap.get(`${candidate.provider}::${candidate.model_id}`) ?? 0
  return failures * multiplier
}

export function calculateCandidateScore(candidate, weights, failurePenalty = 0) {
  const availabilityBonus = candidate.verified_available
    ? Number(weights.availability_bonus ?? 0)
    : 0

  const score =
    Number(candidate.quality_score ?? 0) * Number(weights.quality ?? 0) +
    Number(candidate.reasoning_score ?? 0) * Number(weights.reasoning ?? 0) +
    Number(candidate.coding_score ?? 0) * Number(weights.coding ?? 0) +
    Number(candidate.stability_score ?? 0) * Number(weights.stability ?? 0) +
    Number(candidate.speed_score ?? 0) * Number(weights.speed ?? 0) +
    availabilityBonus -
    failurePenalty

  return Number(score.toFixed(3))
}

function mergeCandidateRows(seedRows, dynamicRows, providerCredential) {
  const merged = new Map()

  for (const row of seedRows) {
    merged.set(row.model_id, { ...row, source: row.source ?? 'seed' })
  }

  for (const row of dynamicRows) {
    const existing = merged.get(row.model_id)
    merged.set(row.model_id, {
      ...existing,
      ...row,
      model_id: row.model_id,
      provider: row.provider,
      display_name: existing?.display_name ?? row.display_name,
      free_candidate: existing?.free_candidate ?? row.free_candidate,
      quality_score: existing?.quality_score ?? row.quality_score,
      reasoning_score: existing?.reasoning_score ?? row.reasoning_score,
      coding_score: existing?.coding_score ?? row.coding_score,
      speed_score: existing?.speed_score ?? row.speed_score,
      stability_score: existing?.stability_score ?? row.stability_score,
      priority: existing?.priority ?? row.priority,
      notes: existing?.notes ?? row.notes,
      source: 'dynamic',
    })
  }

  const customCandidates = parseCandidateListInput(providerCredential?.candidate_models ?? [])
  for (const modelId of customCandidates) {
    const existing = merged.get(modelId)
    merged.set(modelId, {
      provider: providerCredential.provider,
      model_id: modelId,
      display_name: existing?.display_name ?? modelId,
      free_candidate: true,
      verified_available: existing?.verified_available ?? false,
      supports_streaming: existing?.supports_streaming ?? true,
      supports_tools: existing?.supports_tools ?? false,
      supports_vision: existing?.supports_vision ?? false,
      quality_score: existing?.quality_score ?? 75,
      reasoning_score: existing?.reasoning_score ?? 75,
      coding_score: existing?.coding_score ?? 75,
      speed_score: existing?.speed_score ?? 75,
      stability_score: existing?.stability_score ?? 75,
      priority: existing?.priority ?? 12,
      excluded: existing?.excluded ?? false,
      last_checked_at: existing?.last_checked_at ?? null,
      last_error: existing?.last_error ?? '',
      notes: existing?.notes ?? '사용자 지정 모델',
      source: existing?.source ?? 'custom',
    })
  }

  return [...merged.values()]
}

function fallbackReasonFromError(normalizedError, routingMode = 'auto') {
  if (routingMode === 'manual') {
    switch (normalizedError.type) {
      case 'rate_limit':
        return '선택한 공식 API의 요청 한도에 걸렸습니다.'
      case 'billing':
        return '선택한 공식 API 계정 한도 또는 결제 상태를 확인해 주세요.'
      case 'permission':
        return '선택한 공식 API의 권한 또는 키 설정을 확인해 주세요.'
      case 'timeout':
        return '선택한 공식 API 응답 시간이 초과되었습니다.'
      case 'network':
        return '선택한 공식 API에 연결하지 못했습니다.'
      case 'upstream':
        return '선택한 공식 API 서버에서 오류를 반환했습니다.'
      case 'model_unavailable':
        return '선택한 모델을 현재 공급자에서 사용할 수 없습니다.'
      case 'empty':
        return '선택한 공식 API가 빈 응답을 반환했습니다.'
      default:
        return '선택한 공식 API 호출이 실패했습니다.'
    }
  }

  switch (normalizedError.type) {
    case 'rate_limit':
      return '요청 한도에 걸려 다음 자동 후보로 넘깁니다.'
    case 'billing':
      return '과금 또는 계정 한도로 다음 자동 후보로 넘깁니다.'
    case 'permission':
      return '권한 문제로 다음 자동 후보로 넘깁니다.'
    case 'timeout':
      return '응답이 늦어서 다음 자동 후보를 시도합니다.'
    case 'network':
      return '네트워크 오류로 다음 자동 후보를 시도합니다.'
    case 'upstream':
      return '공급자 서버 오류로 다음 자동 후보를 시도합니다.'
    case 'model_unavailable':
      return '현재 키에서 이 모델을 쓸 수 없어 다음 자동 후보를 시도합니다.'
    case 'empty':
      return '스트리밍이 시작되지 않아 다음 자동 후보를 시도합니다.'
    default:
      return '호출이 실패해 다음 자동 후보를 시도합니다.'
  }
}

function createAvailableModes() {
  return [
    {
      id: 'auto-best-free',
      label: '자동 최적',
      description: '품질과 추론을 먼저 봅니다.',
    },
    {
      id: 'auto-best-free-coding',
      label: '자동 코딩 우선',
      description: '코딩과 안정성을 더 높게 봅니다.',
    },
    {
      id: 'auto-best-free-fast',
      label: '자동 빠른 응답',
      description: '속도와 즉시 사용 가능성을 우선합니다.',
    },
    {
      id: 'manual',
      label: '수동 선택',
      description: '공급자와 모델을 직접 고릅니다.',
    },
  ]
}

export function createAiRouter({
  projectRoot,
  fetchWithTimeout,
  requestTimeoutMs,
  firstTokenTimeoutMs,
  appEncryptionKey,
  publicSessionSecret,
  openRouterTitle,
  openRouterReferer,
}) {
  const dataDir = process.env.ARTEMIS_DATA_DIR?.trim()
    ? path.resolve(projectRoot, process.env.ARTEMIS_DATA_DIR)
    : path.join(projectRoot, 'output', 'ai-router')

  const storage = createAiStorage({
    dataDir,
    encryptionKey: appEncryptionKey || publicSessionSecret,
  })

  const adapters = createProviderAdapters({
    fetchWithTimeout,
    requestTimeoutMs,
    firstTokenTimeoutMs,
  })

  function getEnvCredential(provider) {
    switch (provider) {
      case 'openrouter':
        return {
          api_key: process.env.OPENROUTER_API_KEY?.trim() ?? '',
          candidate_models: parseCandidateListInput(process.env.OPENROUTER_DEFAULT_CANDIDATES),
        }
      case 'nvidia-build':
        return {
          api_key: process.env.NVIDIA_BUILD_API_KEY?.trim() ?? '',
          candidate_models: parseCandidateListInput(process.env.NVIDIA_BUILD_DEFAULT_CANDIDATES),
        }
      case 'gemini':
        return {
          api_key: process.env.GEMINI_API_KEY?.trim() ?? '',
          candidate_models: parseCandidateListInput(process.env.GEMINI_DEFAULT_CANDIDATES),
        }
      default:
        return { api_key: '', candidate_models: [] }
    }
  }

  function getResolvedProviderCredential(provider) {
    const normalizedProvider = normalizeProviderId(provider)
    const stored = storage.getProviderCredential(normalizedProvider)
    const envValue = getEnvCredential(normalizedProvider)

    if (!stored) {
      return {
        provider: normalizedProvider,
        label: getProviderLabel(normalizedProvider),
        enabled: false,
        auth_type: 'bearer',
        masked_key: envValue.api_key ? maskSecret(envValue.api_key) : '',
        candidate_models: envValue.candidate_models,
        created_at: null,
        updated_at: null,
        last_test_at: null,
        last_test_status: null,
        last_test_message: '',
        configured: Boolean(envValue.api_key),
        api_key: envValue.api_key,
      }
    }

    return {
      ...stored,
      api_key: stored.api_key || envValue.api_key,
      candidate_models:
        Array.isArray(stored.candidate_models) && stored.candidate_models.length > 0
          ? stored.candidate_models
          : envValue.candidate_models,
      configured: Boolean(stored.api_key || envValue.api_key),
      masked_key:
        stored.masked_key || (envValue.api_key ? maskSecret(envValue.api_key) : ''),
    }
  }

  function seedCatalogFromRegistry() {
    if (storage.listModels().length > 0) {
      return
    }

    const seedRows = []
    for (const provider of AI_PROVIDER_IDS) {
      const registry = getProviderRegistry(projectRoot, provider)
      const credential = getResolvedProviderCredential(provider)
      const rows = (registry.default_candidates ?? []).map((item) => ({
        ...item,
        source: 'seed',
      }))
      seedRows.push(...rows)
      storage.upsertProviderStatus(provider, {
        configured: credential.configured,
        enabled: credential.enabled,
        status: credential.configured ? 'configured' : 'missing',
        detail: credential.configured
          ? '키를 저장했습니다. 연결 테스트를 하면 직접 호출 가능한 모델을 확인합니다.'
          : 'API 키를 저장하면 직접 호출 가능한 모델을 확인합니다.',
        candidate_count: rows.length,
        available_count: 0,
        checked_at: null,
      })
    }

    if (seedRows.length > 0) {
      storage.upsertModels(seedRows)
    }
  }

  seedCatalogFromRegistry()

  async function refreshProviderModels(provider, { verify = true } = {}) {
    const normalizedProvider = normalizeProviderId(provider)
    const credential = getResolvedProviderCredential(normalizedProvider)
    const registryProvider = getProviderRegistry(projectRoot, normalizedProvider)
    const seedRows = (registryProvider.default_candidates ?? []).map((item) => ({
      ...item,
      source: 'seed',
    }))
    let dynamicRows = []

    if (credential.api_key) {
      try {
        dynamicRows = await adapters[normalizedProvider].listDynamicModels({
          apiKey: credential.api_key,
        })
      } catch (error) {
        const normalizedError = normalizeProviderError(normalizedProvider, error)
        storage.upsertProviderStatus(normalizedProvider, {
          configured: credential.configured,
          enabled: credential.enabled,
          status: 'fetch-failed',
          detail: normalizedError.message,
          candidate_count: seedRows.length,
          available_count: 0,
          checked_at: nowIso(),
        })
      }
    }

    const mergedRows = mergeCandidateRows(seedRows, dynamicRows, credential).filter(
      (item) => item.free_candidate,
    )

    const verifiedRows = []
    for (const row of mergedRows) {
      let verifiedAvailable = row.verified_available
      let lastError = row.last_error ?? ''
      let lastCheckedAt = row.last_checked_at ?? null

      if (verify && credential.api_key) {
        lastCheckedAt = nowIso()
        try {
          await adapters[normalizedProvider].verifyModelAvailability({
            apiKey: credential.api_key,
            modelId: row.model_id,
            appTitle: openRouterTitle,
            httpReferer: openRouterReferer,
          })
          verifiedAvailable = true
          lastError = ''
        } catch (error) {
          const normalizedError = normalizeProviderError(normalizedProvider, error)
          verifiedAvailable = false
          lastError = normalizedError.message
        }
      }

      verifiedRows.push({
        ...row,
        verified_available: verifiedAvailable,
        last_checked_at: lastCheckedAt,
        last_error: lastError,
      })
    }

    storage.upsertModels(verifiedRows)
    storage.upsertProviderStatus(normalizedProvider, {
      configured: credential.configured,
      enabled: credential.enabled,
      status: credential.configured
        ? verifiedRows.some((item) => item.verified_available)
          ? 'ready'
          : 'no-free-available'
        : 'missing',
      detail: credential.configured
        ? verifiedRows.some((item) => item.verified_available)
          ? '직접 호출 가능한 모델을 확인했고 지금 바로 사용할 수 있습니다.'
          : '키는 저장됐지만 지금 바로 쓸 수 있는 모델을 찾지 못했습니다.'
        : 'API 키를 저장하면 직접 호출 가능한 모델을 확인합니다.',
      candidate_count: verifiedRows.length,
      available_count: verifiedRows.filter((item) => item.verified_available).length,
      checked_at: nowIso(),
    })

    return storage.listModels({ provider: normalizedProvider })
  }

  async function refreshAllModels({ verify = true } = {}) {
    const rows = []
    for (const provider of AI_PROVIDER_IDS) {
      rows.push(...await refreshProviderModels(provider, { verify }))
    }
    return rows
  }

  function getProviders() {
    const credentials = storage.listProviderCredentials()
    const statuses = new Map(storage.listProviderStatuses().map((item) => [item.provider, item]))

    return credentials.map((item) => ({
      ...item,
      status: statuses.get(item.provider)?.status ?? 'missing',
      detail: statuses.get(item.provider)?.detail ?? 'API 키를 저장하면 직접 호출 가능한 모델을 확인합니다.',
      available_count: statuses.get(item.provider)?.available_count ?? 0,
      candidate_count: statuses.get(item.provider)?.candidate_count ?? 0,
      checked_at: statuses.get(item.provider)?.checked_at ?? null,
    }))
  }

  function getSettings() {
    const routing = storage.getRoutingSettings()
    return {
      routing_mode: routing.routing_mode,
      manual_provider: routing.manual_provider,
      manual_model: routing.manual_model,
      updated_at: routing.updated_at,
      available_modes: createAvailableModes(),
      weights: loadFreeModelRegistry(projectRoot).weights,
    }
  }

  function saveSettings(payload = {}) {
    if (Array.isArray(payload.exclusions)) {
      for (const item of payload.exclusions) {
        if (!item?.provider || !item?.model_id) {
          continue
        }
        storage.setModelExcluded(item.provider, item.model_id, Boolean(item.excluded))
      }
    }

    storage.saveRoutingSettings({
      routing_mode: payload.routing_mode,
      manual_provider: payload.manual_provider,
      manual_model: payload.manual_model,
    })

    return getSettings()
  }

  function buildRankedCandidates({ routingMode, manualProvider, manualModel }) {
    const mode = normalizeRoutingMode(routingMode)
    const providerMap = new Map(getProviders().map((item) => [item.provider, item]))
    const failureMap = storage.getRecentFailureCounts()
    const weights = getRoutingWeights(projectRoot, mode)

    const allModels = storage.listModels({ includeExcluded: false })
    let models = allModels.filter((item) => {
      const provider = providerMap.get(item.provider)
      return Boolean(provider?.enabled && provider?.configured && item.free_candidate)
    })

    if (mode === 'manual') {
      const normalizedProvider = manualProvider ? normalizeProviderId(manualProvider) : null
      const normalizedModel = typeof manualModel === 'string' ? manualModel.trim() : ''

      if (normalizedProvider) {
        models = models.filter((item) => item.provider === normalizedProvider)
      }
      if (normalizedModel) {
        models = models.filter((item) => item.model_id === normalizedModel)
      }

      if (normalizedProvider && normalizedModel && models.length === 0) {
        const provider = providerMap.get(normalizedProvider)
        const storedCandidate = allModels.find(
          (item) => item.provider === normalizedProvider && item.model_id === normalizedModel,
        )

        if (provider?.enabled && provider?.configured) {
          models = [
            {
              provider: normalizedProvider,
              model_id: normalizedModel,
              display_name: storedCandidate?.display_name ?? normalizedModel,
              free_candidate: storedCandidate?.free_candidate ?? false,
              verified_available: storedCandidate?.verified_available ?? true,
              supports_streaming: storedCandidate?.supports_streaming ?? true,
              supports_tools: storedCandidate?.supports_tools ?? false,
              supports_vision: storedCandidate?.supports_vision ?? false,
              quality_score: storedCandidate?.quality_score ?? 80,
              reasoning_score: storedCandidate?.reasoning_score ?? 80,
              coding_score: storedCandidate?.coding_score ?? 80,
              speed_score: storedCandidate?.speed_score ?? 80,
              stability_score: storedCandidate?.stability_score ?? 80,
              priority: storedCandidate?.priority ?? 20,
              excluded: false,
              last_checked_at: storedCandidate?.last_checked_at ?? null,
              last_error: storedCandidate?.last_error ?? '',
              notes:
                storedCandidate?.notes ??
                '수동 직접 실행용 모델',
              source: storedCandidate?.source ?? 'manual-direct',
            },
          ]
        }
      }
    }

    const candidates = models
      .map((item) => {
        const failurePenalty = failurePenaltyFor(
          item,
          failureMap,
          Number(weights.failure_penalty_multiplier ?? 0),
        )

        return {
          ...item,
          score: calculateCandidateScore(item, weights, failurePenalty),
          failure_penalty: failurePenalty,
          provider_label: getProviderLabel(item.provider),
        }
      })
      .filter((item) => mode === 'manual' || item.verified_available)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score
        }
        if (right.priority !== left.priority) {
          return right.priority - left.priority
        }
        return left.model_id.localeCompare(right.model_id)
      })

    return { mode, weights, candidates }
  }

  async function testProvider(provider) {
    const normalizedProvider = normalizeProviderId(provider)
    const credential = getResolvedProviderCredential(normalizedProvider)

    if (!credential.api_key) {
      storage.updateProviderTestResult(normalizedProvider, {
        last_test_at: nowIso(),
        last_test_status: 'failed',
        last_test_message: 'API 키가 아직 저장되지 않았습니다.',
      })
      return {
        ok: false,
        provider: normalizedProvider,
        status: 'missing',
        message: 'API 키가 아직 저장되지 않았습니다.',
      }
    }

    const models = await refreshProviderModels(normalizedProvider, { verify: true })
    const availableModel = models.find((item) => item.verified_available && !item.excluded)

    if (!availableModel) {
      storage.updateProviderTestResult(normalizedProvider, {
        last_test_at: nowIso(),
        last_test_status: 'failed',
        last_test_message: '현재 키로 바로 호출되는 모델을 찾지 못했습니다.',
      })
      return {
        ok: false,
        provider: normalizedProvider,
        status: 'no-free-available',
        message: '현재 키로 바로 호출되는 모델을 찾지 못했습니다.',
      }
    }

    await adapters[normalizedProvider].testConnection({
      apiKey: credential.api_key,
      modelId: availableModel.model_id,
      appTitle: openRouterTitle,
      httpReferer: openRouterReferer,
    })

    storage.updateProviderTestResult(normalizedProvider, {
      last_test_at: nowIso(),
      last_test_status: 'success',
      last_test_message: `${availableModel.display_name} 연결 성공`,
    })

    return {
      ok: true,
      provider: normalizedProvider,
      status: 'ready',
      message: `${availableModel.display_name} 연결 성공`,
      model: availableModel.model_id,
    }
  }

  async function previewRoute(payload = {}) {
    const providerStates = getProviders()
    const anyConfiguredProvider = providerStates.some((item) => item.enabled && item.configured)
    const hasVerifiedCandidates = storage
      .listModels({ includeExcluded: false })
      .some((item) => item.verified_available)

    if (anyConfiguredProvider && !hasVerifiedCandidates) {
      await refreshAllModels({ verify: true })
    }

    return buildRankedCandidates({
      routingMode: payload.routing_mode ?? storage.getRoutingSettings().routing_mode,
      manualProvider: payload.manual_provider ?? storage.getRoutingSettings().manual_provider,
      manualModel: payload.manual_model ?? storage.getRoutingSettings().manual_model,
    })
  }

  async function streamChat(payload, { writeEvent }) {
    const sessionId = String(payload.sessionId ?? `session-${randomUUID()}`)
    const userPrompt = String(payload.prompt ?? '').trim()
    const routingSettings = storage.getRoutingSettings()
    const routingMode = normalizeRoutingMode(payload.routing_mode ?? routingSettings.routing_mode)
    const manualProvider = payload.manual_provider ?? routingSettings.manual_provider
    const manualModel = payload.manual_model ?? routingSettings.manual_model

    if (!userPrompt) {
      throw new Error('질문 또는 작업 지시가 비어 있습니다.')
    }

    const hasVerifiedCandidates = storage
      .listModels({ includeExcluded: false })
      .some((item) => item.verified_available)
    if (!hasVerifiedCandidates) {
      await refreshAllModels({ verify: true })
    }

    const preview = buildRankedCandidates({ routingMode, manualProvider, manualModel })
    const candidates = preview.candidates

    if (candidates.length === 0) {
      throw new Error(
        routingMode === 'manual'
          ? '선택한 공식 API 공급자 또는 모델을 바로 호출하지 못했습니다. 설정에서 공급자 연결과 모델 ID를 확인해 주세요.'
          : '활성화된 공급자에서 지금 호출 가능한 모델을 찾지 못했습니다.',
      )
    }

    storage.upsertChatSession({
      id: sessionId,
      title: userPrompt.slice(0, 32),
      created_at: nowIso(),
      updated_at: nowIso(),
    })

    storage.insertChatMessage({
      id: `msg-${randomUUID()}`,
      session_id: sessionId,
      role: 'user',
      text: userPrompt,
      metadata: { routing_mode: routingMode },
      created_at: nowIso(),
    })

    await writeEvent('meta', {
      session_id: sessionId,
      routing_mode: routingMode,
      candidate_count: candidates.length,
      top_candidate: candidates[0]
        ? {
            provider: candidates[0].provider,
            provider_label: candidates[0].provider_label,
            model: candidates[0].model_id,
            display_name: candidates[0].display_name,
            score: candidates[0].score,
          }
        : null,
    })

    const attemptLogs = []
    let finalResponse = null

    for (const [index, candidate] of candidates.entries()) {
      const credential = getResolvedProviderCredential(candidate.provider)

      if (!credential.api_key) {
        attemptLogs.push({
          id: `attempt-${randomUUID()}`,
          session_id: sessionId,
          message_id: null,
          routing_mode: routingMode,
          attempt_index: index + 1,
          provider: candidate.provider,
          model: candidate.model_id,
          started_at: nowIso(),
          first_token_at: null,
          ended_at: nowIso(),
          success: false,
          error_type: 'missing_key',
          error_message: 'API 키가 저장되지 않았습니다.',
          status_code: null,
          latency_ms: 0,
          fallback_reason: '설정되지 않은 공급자라 이번 후보는 건너뜁니다.',
          score_at_selection: candidate.score,
        })
        continue
      }

      const startedAt = nowIso()
      let firstTokenAt = null

      await writeEvent('attempt', {
        attempt_index: index + 1,
        provider: candidate.provider,
        provider_label: candidate.provider_label,
        model: candidate.model_id,
        display_name: candidate.display_name,
        started_at: startedAt,
        score_at_selection: candidate.score,
      })

      try {
        const result = await adapters[candidate.provider].streamChat({
          apiKey: credential.api_key,
          modelId: candidate.model_id,
          appTitle: openRouterTitle,
          httpReferer: openRouterReferer,
          messages: payload.messages ?? [],
          prompt: userPrompt,
          systemPrompt: payload.systemPrompt ?? '',
          onFirstToken: (value) => {
            firstTokenAt = value
          },
          onToken: async (chunk) => {
            await writeEvent('token', {
              provider: candidate.provider,
              model: candidate.model_id,
              content: chunk,
            })
          },
        })

        finalResponse = {
          provider: candidate.provider,
          provider_label: candidate.provider_label,
          model: candidate.model_id,
          display_name: candidate.display_name,
          text: result.text,
          first_token_at: result.firstTokenAt ?? firstTokenAt,
          score_at_selection: candidate.score,
        }

        attemptLogs.push({
          id: `attempt-${randomUUID()}`,
          session_id: sessionId,
          message_id: null,
          routing_mode: routingMode,
          attempt_index: index + 1,
          provider: candidate.provider,
          model: candidate.model_id,
          started_at: startedAt,
          first_token_at: result.firstTokenAt ?? firstTokenAt,
          ended_at: nowIso(),
          success: true,
          error_type: null,
          error_message: null,
          status_code: null,
          latency_ms: Date.now() - new Date(startedAt).getTime(),
            fallback_reason:
              index === 0 ? null : '이전 자동 후보 실패 후 자동 폴백으로 성공했습니다.',
          score_at_selection: candidate.score,
        })
        break
      } catch (error) {
        const normalizedError = normalizeProviderError(candidate.provider, error)
        attemptLogs.push({
          id: `attempt-${randomUUID()}`,
          session_id: sessionId,
          message_id: null,
          routing_mode: routingMode,
          attempt_index: index + 1,
          provider: candidate.provider,
          model: candidate.model_id,
          started_at: startedAt,
          first_token_at: firstTokenAt,
          ended_at: nowIso(),
          success: false,
          error_type: normalizedError.type,
          error_message: normalizedError.message,
          status_code: normalizedError.statusCode,
          latency_ms: Date.now() - new Date(startedAt).getTime(),
          fallback_reason: fallbackReasonFromError(normalizedError, routingMode),
          score_at_selection: candidate.score,
        })

        await writeEvent('attempt_failed', {
          attempt_index: index + 1,
          provider: candidate.provider,
          provider_label: candidate.provider_label,
          model: candidate.model_id,
          error_type: normalizedError.type,
          error_message: normalizedError.message,
          status_code: normalizedError.statusCode,
          fallback_reason: fallbackReasonFromError(normalizedError, routingMode),
        })
      }
    }

    storage.insertAttemptLogs(attemptLogs)

    if (!finalResponse) {
      throw new Error(
        routingMode === 'manual'
          ? '선택한 공식 API 호출이 실패했습니다.'
          : '모든 자동 후보 호출이 실패했습니다.',
      )
    }

    const assistantMessageId = `msg-${randomUUID()}`
    storage.insertChatMessage({
      id: assistantMessageId,
      session_id: sessionId,
      role: 'assistant',
      text: finalResponse.text,
      provider: finalResponse.provider,
      model: finalResponse.model,
      metadata: {
        routing_mode: routingMode,
        attempts: attemptLogs,
        final_provider: finalResponse.provider,
        final_model: finalResponse.model,
        final_score: finalResponse.score_at_selection,
      },
      created_at: nowIso(),
    })

    await writeEvent('final', {
      session_id: sessionId,
      message_id: assistantMessageId,
      provider: finalResponse.provider,
      provider_label: finalResponse.provider_label,
      model: finalResponse.model,
      display_name: finalResponse.display_name,
      text: finalResponse.text,
      routing_mode: routingMode,
      attempts: attemptLogs,
      first_token_at: finalResponse.first_token_at,
      score_at_selection: finalResponse.score_at_selection,
    })

    return {
      session_id: sessionId,
      message_id: assistantMessageId,
      provider: finalResponse.provider,
      model: finalResponse.model,
      text: finalResponse.text,
      attempts: attemptLogs,
    }
  }

  return {
    storage,
    getProviders,
    getResolvedProviderCredential,
    refreshProviderModels,
    refreshAllModels,
    testProvider,
    getSettings,
    saveSettings,
    previewRoute,
    streamChat,
    listModels: (options) => storage.listModels(options),
    listRoutingLogs: (options) => storage.listAttemptLogs(options),
    saveProvider(provider, payload) {
      const saved = storage.saveProviderCredential(provider, payload)
      const providerModels = storage.listModels({ provider: saved.provider })
      const registry = getProviderRegistry(projectRoot, saved.provider)
      const candidateCount =
        providerModels.length > 0
          ? providerModels.filter((item) => item.free_candidate).length
          : (registry.default_candidates ?? []).length
      const availableCount = providerModels.filter((item) => item.verified_available && !item.excluded).length

      storage.upsertProviderStatus(saved.provider, {
        configured: saved.configured,
        enabled: saved.enabled,
        status: saved.configured ? 'configured' : 'missing',
        detail: saved.configured
          ? '키를 저장했습니다. 연결 테스트를 하면 직접 호출 가능한 모델을 확인합니다.'
          : 'API 키를 저장하면 직접 호출 가능한 모델을 확인합니다.',
        candidate_count: candidateCount,
        available_count: availableCount,
        checked_at: nowIso(),
      })

      return getProviders().find((item) => item.provider === saved.provider) ?? saved
    },
    setModelExcluded(provider, modelId, excluded) {
      storage.setModelExcluded(provider, modelId, excluded)
      return storage.listModels({ provider })
    },
  }
}
