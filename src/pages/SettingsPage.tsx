import { useCallback, useEffect, useMemo, useState } from 'react'
import { settingsTabs, type PageId, type SettingsTab } from '../crewData'
import {
  fetchAiModels,
  fetchAiProviders,
  fetchAiSettings,
  previewAiRoute,
  refreshAiModels,
  saveAiProvider,
  saveAiSettings,
  testAiProvider,
  type AiModelCatalogEntry,
  type AiProviderId,
  type AiProviderState,
  type AiRoutePreview,
  type AiRoutingMode,
  type AiRoutingSettings,
} from '../lib/aiRoutingClient'
import { getAgentPreset } from '../lib/agentCatalog'
import type { ProviderStatus } from '../lib/modelClient'
import { formatFriendlyModelName } from '../crewPageHelpers'
import { DisclosureSection, EmptyState, PageIntro } from '../crewPageShared'
import { Icon } from '../icons'
import { useArtemisApp } from '../state/context'
import type { AgentCapability, AgentPresetId } from '../state/types'

const MANAGED_AGENT_PRESETS: AgentPresetId[] = ['official-router', 'codex-cli', 'ollama-local']
const OFFICIAL_PROVIDER_ORDER: AiProviderId[] = ['openrouter', 'nvidia-build', 'gemini']
const LOCAL_PROVIDER_ORDER = ['ollama', 'codex'] as const

type ProviderDraft = {
  enabled: boolean
  apiKey: string
  candidateModelsText: string
}

type LocalProviderCard = ProviderStatus & {
  provider: (typeof LOCAL_PROVIDER_ORDER)[number]
}

function isDocScreenshotMode() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('artemis-doc-screenshot-mode') === '1'
  } catch {
    return false
  }
}

function capabilityLabel(capability: AgentCapability) {
  switch (capability) {
    case 'chat':
      return '채팅'
    case 'files':
      return '파일'
    case 'web':
      return '웹'
    case 'automation':
      return '자동화'
    case 'code':
      return '코드'
    default:
      return capability
  }
}

function providerDescription(provider: AiProviderId) {
  switch (provider) {
    case 'openrouter':
      return 'OpenRouter 공식 API'
    case 'nvidia-build':
      return 'NVIDIA Build 공식 API'
    case 'gemini':
      return 'Gemini Developer API'
    default:
      return provider
  }
}

function providerIconName(provider: AiProviderId): 'globe' | 'desktop' | 'spark' {
  switch (provider) {
    case 'openrouter':
      return 'globe'
    case 'nvidia-build':
      return 'desktop'
    case 'gemini':
      return 'spark'
    default:
      return 'globe'
  }
}

function localProviderLabel(provider: 'ollama' | 'codex') {
  return provider === 'ollama' ? 'Ollama 로컬' : 'Codex CLI'
}

function localProviderIconName(provider: 'ollama' | 'codex'): 'spark' | 'agent' {
  return provider === 'ollama' ? 'spark' : 'agent'
}

function formatLocalProviderTime(value?: string | null) {
  if (!value) {
    return '기록 없음'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('ko-KR', {
        hour12: false,
      })
}

function localProviderSummary(provider: LocalProviderCard) {
  if (provider.provider === 'ollama') {
    if (provider.ready && provider.stale) {
      return '최근 확인은 실패했지만 마지막으로 확인된 Ollama 모델 상태를 유지 중입니다.'
    }

    if (provider.ready) {
      return '로컬 Ollama 모델을 바로 채팅과 오케스트레이션에 붙입니다.'
    }

    if (provider.available) {
      return 'Ollama 서버는 보이지만 바로 쓸 모델 상태를 다시 확인해야 합니다.'
    }

    return 'Ollama 앱 실행과 모델 목록 확인이 필요합니다.'
  }

  return provider.ready
    ? '로컬 Codex CLI가 실제 파일 수정과 코드 작업을 처리합니다.'
    : 'Codex CLI 로그인 또는 준비 상태를 다시 확인해야 합니다.'
}

function localProviderStatusLabel(provider: {
  available: boolean
  ready: boolean
  stale?: boolean
}) {
  if (provider.ready && provider.stale) return '마지막 정상 상태'
  if (provider.ready) return '준비 완료'
  if (provider.available) return '부분 준비'
  return '미연결'
}

function buildFallbackLocalProvider(
  provider: (typeof LOCAL_PROVIDER_ORDER)[number],
  bridgeError: string | null,
): LocalProviderCard {
  const isOllama = provider === 'ollama'

  return {
    provider,
    available: false,
    ready: false,
    models: isOllama ? [] : ['gpt-5.4', 'gpt-5.4-mini'],
    detail: isOllama
      ? '로컬 Ollama 상태를 아직 확인하지 못했습니다.'
      : 'Codex CLI 상태를 아직 확인하지 못했습니다.',
    warning: bridgeError ? '최근 확인에 실패했습니다.' : '상태 확인 전입니다.',
    lastError: bridgeError,
    stale: Boolean(bridgeError),
    lastCheckedAt: null,
    lastSuccessAt: null,
  }
}

function providerAutoSummary(provider: AiProviderId) {
  switch (provider) {
    case 'openrouter':
      return '키를 저장하면 OpenRouter 무료 후보 중 실제로 호출되는 모델만 자동 후보에 들어갑니다.'
    case 'nvidia-build':
      return '키를 저장하면 NVIDIA Build 무료 호출 가능 후보만 자동 검증 후 후보에 들어갑니다.'
    case 'gemini':
      return '키를 저장하면 Gemini 무료 호출 가능 후보만 확인해서 자동 후보에 넣습니다.'
    default:
      return '키를 저장하고 테스트를 통과한 무료 후보만 자동 라우팅에 들어갑니다.'
  }
}

function providerInputHint(provider: AiProviderId) {
  switch (provider) {
    case 'openrouter':
      return 'OpenRouter 공식 키를 넣으면 OpenRouter 무료 후보만 검사합니다.'
    case 'nvidia-build':
      return 'NVIDIA Build 공식 키를 넣으면 NVIDIA 무료 개발 후보만 검사합니다.'
    case 'gemini':
      return 'Gemini Developer API 키를 넣으면 Gemini 무료 후보만 검사합니다.'
    default:
      return '공식 사이트에서 받은 키만 넣어 주세요.'
  }
}

function providerFlowSteps(provider: AiProviderId) {
  return [
    '키 저장',
    `${provider === 'gemini' ? 'Gemini' : provider === 'nvidia-build' ? 'NVIDIA' : 'OpenRouter'} 연결 테스트`,
    '통과한 무료 후보만 자동 선택',
  ]
}

function providerStatusLabel(provider: AiProviderState) {
  if (!provider.enabled) return '비활성'
  if (!provider.configured) return '미설정'
  if (provider.status === 'ready') return '연결 성공'
  if (provider.available_count > 0) return '무료 후보 탐색 가능'
  if (provider.last_test_status === 'failed') return '연결 실패'
  return '설정됨'
}

function routingModeLabel(mode: AiRoutingMode) {
  switch (mode) {
    case 'auto-best-free':
      return '자동 무료 최상'
    case 'auto-best-free-coding':
      return '자동 무료 코딩 최상'
    case 'auto-best-free-fast':
      return '자동 무료 빠른 응답'
    case 'manual':
      return '수동 선택'
    default:
      return mode
  }
}

function buildProviderDrafts(providers: AiProviderState[]) {
  return providers.reduce<Record<string, ProviderDraft>>((accumulator, provider) => {
    accumulator[provider.provider] = {
      enabled: provider.enabled,
      apiKey: '',
      candidateModelsText: provider.candidate_models.join('\n'),
    }
    return accumulator
  }, {})
}

function SettingsProfilePane() {
  const { state, updateSettings } = useArtemisApp()
  return (
    <section className="settings-card">
      <h2>에이전트 프로필</h2>
      <div className="settings-grid">
        <label className="field field--full">
          <span>이름</span>
          <input value={state.settings.agentName} onChange={(event) => updateSettings({ agentName: event.target.value })} />
        </label>
        <label className="field">
          <span>말투</span>
          <input value={state.settings.tone} onChange={(event) => updateSettings({ tone: event.target.value })} />
        </label>
        <label className="field">
          <span>응답 형식</span>
          <input
            value={state.settings.responseStyle}
            onChange={(event) => updateSettings({ responseStyle: event.target.value })}
          />
        </label>
        <label className="field field--full">
          <span>사용자 지침</span>
          <textarea
            rows={4}
            value={state.settings.customInstructions}
            onChange={(event) => updateSettings({ customInstructions: event.target.value })}
          />
        </label>
      </div>
    </section>
  )
}

function SettingsPreferencesPane() {
  const { resetAll, state, updateSettings } = useArtemisApp()
  return (
    <div className="stack-grid">
      <section className="settings-card">
        <h2>화면 테마</h2>
        <div className="chip-wrap">
          {(['light', 'dark', 'system'] as const).map((item) => (
            <button
              key={item}
              className={`chip ${state.settings.theme === item ? 'is-active' : ''}`}
              onClick={() => updateSettings({ theme: item })}
              type="button"
            >
              {item === 'light' ? '라이트' : item === 'dark' ? '다크' : '시스템'}
            </button>
          ))}
        </div>
      </section>

      <section className="settings-card">
        <h2>실행 환경</h2>
        <div className="settings-grid">
          <label className="field">
            <span>언어</span>
            <input value={state.settings.language} onChange={(event) => updateSettings({ language: event.target.value })} />
          </label>
          <label className="field">
            <span>시간대</span>
            <input value={state.settings.timezone} onChange={(event) => updateSettings({ timezone: event.target.value })} />
          </label>
          <label className="field field--full">
            <span>브리지 URL</span>
            <input value={state.settings.bridgeUrl} onChange={(event) => updateSettings({ bridgeUrl: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="settings-card settings-card--danger">
        <h2>로컬 상태 초기화</h2>
        <p>브라우저에 저장된 대화, 화면 상태, 최근 선택 기록만 초기화합니다.</p>
        <button className="danger-button" onClick={resetAll} type="button">
          로컬 상태 초기화
        </button>
      </section>
    </div>
  )
}

function SettingsModelsPane({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const {
    activeAgent,
    bridgeError,
    bridgeHealth,
    createAgent,
    deleteAgent,
    refreshBridgeHealth,
    setActiveAgent,
    state,
    updateAgent,
    workspaceAbsolutePath,
    workspaceRootPath,
  } = useArtemisApp()
  const [aiProviders, setAiProviders] = useState<AiProviderState[]>([])
  const [aiModels, setAiModels] = useState<AiModelCatalogEntry[]>([])
  const [aiSettings, setAiSettings] = useState<AiRoutingSettings | null>(null)
  const [aiPreview, setAiPreview] = useState<AiRoutePreview | null>(null)
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({})
  const [aiError, setAiError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [isRefreshingLocalProviders, setIsRefreshingLocalProviders] = useState(false)
  const docScreenshotMode = useMemo(() => isDocScreenshotMode(), [])

  const managedAgents = useMemo(
    () => state.agents.items.filter((agent) => MANAGED_AGENT_PRESETS.includes(agent.preset)),
    [state.agents.items],
  )
  const activeManagedAgent =
    (activeAgent && MANAGED_AGENT_PRESETS.includes(activeAgent.preset) ? activeAgent : null) ?? managedAgents[0] ?? null
  const topCandidate = aiPreview?.candidates[0] ?? null
  const localProviders = useMemo(
    () => {
      const providerMap = new Map(
        (bridgeHealth?.providers ?? [])
          .filter(
            (item): item is LocalProviderCard =>
              item.provider === 'ollama' || item.provider === 'codex',
          )
          .map((item) => [item.provider, item]),
      )

      return LOCAL_PROVIDER_ORDER.map(
        (provider) => providerMap.get(provider) ?? buildFallbackLocalProvider(provider, bridgeError),
      )
    },
    [bridgeError, bridgeHealth],
  )
  const readyLocalProviders = useMemo(
    () => localProviders.filter((item) => item.ready).length,
    [localProviders],
  )
  const showingCachedLocalState = useMemo(
    () => localProviders.some((item) => item.stale),
    [localProviders],
  )
  const manualCandidates = useMemo(
    () =>
      [...aiModels]
        .filter((item) => item.free_candidate && item.verified_available && !item.excluded)
        .sort((left, right) => (right.score ?? right.quality_score) - (left.score ?? left.quality_score)),
    [aiModels],
  )
  const visibleAiProviders = useMemo(
    () =>
      docScreenshotMode
        ? aiProviders.map((provider) => ({
            ...provider,
            enabled: false,
            masked_key: '',
            configured: false,
            status: 'idle',
            detail: '',
            available_count: 0,
            last_test_at: null,
            last_test_status: null,
            last_test_message: '',
          }))
        : aiProviders,
    [aiProviders, docScreenshotMode],
  )
  const readyOfficialProviders = useMemo(
    () =>
      visibleAiProviders.filter(
        (item) => item.enabled && item.configured && (item.status === 'ready' || item.available_count > 0),
      ).length,
    [visibleAiProviders],
  )

  const handleRefreshLocalProviders = useCallback(async () => {
    setIsRefreshingLocalProviders(true)
    try {
      await refreshBridgeHealth()
    } finally {
      setIsRefreshingLocalProviders(false)
    }
  }, [refreshBridgeHealth])

  const loadAiState = useCallback(async () => {
    try {
      const [providers, settings, models] = await Promise.all([
        fetchAiProviders(state.settings.bridgeUrl),
        fetchAiSettings(state.settings.bridgeUrl),
        fetchAiModels(state.settings.bridgeUrl, { includeExcluded: true }),
      ])
      const preview = await previewAiRoute(state.settings.bridgeUrl, {
        routing_mode: settings.routing_mode,
        manual_provider: settings.manual_provider,
        manual_model: settings.manual_model,
      })
      setAiProviders(providers)
      setAiSettings(settings)
      setAiModels(models)
      setAiPreview(preview)
      setProviderDrafts(buildProviderDrafts(providers))
      setAiError(null)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 설정을 불러오지 못했습니다.')
    }
  }, [state.settings.bridgeUrl])

  useEffect(() => {
    void loadAiState()
  }, [loadAiState])

  const updateDraft = (provider: AiProviderId, patch: Partial<ProviderDraft>) => {
    setProviderDrafts((drafts) => ({
      ...drafts,
      [provider]: {
        enabled: patch.enabled ?? drafts[provider]?.enabled ?? false,
        apiKey: patch.apiKey ?? drafts[provider]?.apiKey ?? '',
        candidateModelsText: patch.candidateModelsText ?? drafts[provider]?.candidateModelsText ?? '',
      },
    }))
  }

  const saveProviderConfig = async (provider: AiProviderId) => {
    const draft = providerDrafts[provider]
    setBusyKey(`${provider}:save`)
    try {
      await saveAiProvider(state.settings.bridgeUrl, provider, {
        enabled: draft?.enabled ?? false,
        apiKey: draft?.apiKey.trim() ? draft.apiKey.trim() : undefined,
        candidateModels: (draft?.candidateModelsText ?? '').split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean),
      })
      await loadAiState()
      updateDraft(provider, { apiKey: '' })
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '공급자 저장에 실패했습니다.')
    } finally {
      setBusyKey(null)
    }
  }

  const runProviderTest = async (provider: AiProviderId) => {
    setBusyKey(`${provider}:test`)
    try {
      await testAiProvider(state.settings.bridgeUrl, provider)
      await loadAiState()
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '연결 테스트에 실패했습니다.')
    } finally {
      setBusyKey(null)
    }
  }

  const refreshProviderCatalog = async (provider?: AiProviderId) => {
    setBusyKey(provider ? `${provider}:refresh` : 'all:refresh')
    try {
      await refreshAiModels(state.settings.bridgeUrl, provider)
      await loadAiState()
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '무료 후보 새로고침에 실패했습니다.')
    } finally {
      setBusyKey(null)
    }
  }

  const updateRoutingMode = async (routingMode: AiRoutingMode) => {
    await saveAiSettings(state.settings.bridgeUrl, {
      routing_mode: routingMode,
      manual_provider: routingMode === 'manual' ? aiSettings?.manual_provider ?? null : null,
      manual_model: routingMode === 'manual' ? aiSettings?.manual_model ?? null : null,
    })
    await loadAiState()
  }

  const updateManualCandidate = async (provider: AiProviderId, modelId: string) => {
    await saveAiSettings(state.settings.bridgeUrl, {
      routing_mode: 'manual',
      manual_provider: provider,
      manual_model: modelId,
    })
    await loadAiState()
  }

  const toggleCandidateExclusion = async (model: AiModelCatalogEntry) => {
    await saveAiSettings(state.settings.bridgeUrl, {
      exclusions: [{ provider: model.provider, model_id: model.model_id, excluded: !model.excluded }],
    })
    await loadAiState()
  }

  return (
    <div className="stack-grid">
      <section className="settings-card settings-card--compact">
        <div className="panel-card__header">
          <h2>AI 공급자 설정</h2>
          <span className="chip is-active">서버 암호화 저장</span>
        </div>
        <p className="settings-card__lead">
          무료 후보도 공식 API 키는 필요합니다. 키 저장 후 테스트를 통과한 후보만 자동 무료 라우팅에 들어갑니다.
        </p>
        <div className="settings-summary-strip">
          <span className={`chip ${readyLocalProviders > 0 ? 'is-active' : 'chip--soft'}`}>로컬 실행기 {readyLocalProviders}개</span>
          <span className={`chip ${readyOfficialProviders > 0 ? 'is-active' : 'chip--soft'}`}>공식 공급자 {readyOfficialProviders}개 준비</span>
          <span className={`chip ${workspaceAbsolutePath || workspaceRootPath ? 'is-active' : 'chip--soft'}`}>
            작업 폴더 {workspaceAbsolutePath || workspaceRootPath ? '연결됨' : '미연결'}
          </span>
        </div>
        <div className="settings-ruleStrip">
          <div className="settings-ruleCard"><strong>1. 키 저장</strong><span>키는 서버에서만 복호화합니다.</span></div>
          <div className="settings-ruleCard"><strong>2. 연결 테스트</strong><span>실제 호출 가능한 무료 후보만 통과합니다.</span></div>
          <div className="settings-ruleCard"><strong>3. 자동 폴백</strong><span>실패하면 다음 무료 후보를 자동 시도합니다.</span></div>
        </div>
        <div className="settings-actionRow">
          <button className="primary-button" onClick={() => onNavigate('chat')} type="button">채팅 열기</button>
          <button className="ghost-button" onClick={() => onNavigate('agents')} type="button">오케스트레이션 보기</button>
          <button
            className="ghost-button"
            disabled={isRefreshingLocalProviders}
            onClick={() => void handleRefreshLocalProviders()}
            type="button"
          >
            {isRefreshingLocalProviders ? '로컬 상태 확인 중' : '로컬 상태 새로고침'}
          </button>
        </div>
        {aiError ? <div className="status-banner status-banner--error"><Icon name="warning" size={16} /><span>{aiError}</span></div> : null}
        {bridgeError ? (
          <div className="status-banner status-banner--warning">
            <Icon name="warning" size={16} />
            <span>
              {showingCachedLocalState
                ? `최근 로컬 상태 확인에 실패했습니다. 마지막 정상 상태를 유지 중입니다. ${bridgeError}`
                : bridgeError}
            </span>
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <DisclosureSection
          className="settings-disclosure"
          defaultOpen
          summary="Ollama와 Codex의 실제 로컬 준비 상태를 먼저 확인합니다."
          title="0. 로컬 실행기"
        >
          <div className="panel-card__header">
            <p className="settings-card__lead">
              로컬 실행기는 API 키 없이 바로 붙습니다. 최근 확인이 실패해도 마지막 정상 상태를 유지하면서 다시 확인합니다.
            </p>
          </div>
          <div className="provider-grid provider-grid--local">
            {localProviders.map((provider) => {
              const providerLabel = localProviderLabel(provider.provider)
              const isOllama = provider.provider === 'ollama'
              const currentModelName =
                provider.models.length > 0
                  ? formatFriendlyModelName(provider.models[0])
                  : isOllama
                    ? '최근 확인된 모델 없음'
                    : '기본 모델 확인 대기 중'
              const effectiveWarning =
                provider.warning ??
                (bridgeError ? '최근 로컬 상태 확인에 실패했습니다. 마지막 정상 상태를 표시 중입니다.' : null)
              const effectiveLastError = provider.lastError ?? bridgeError
              const statusMessage = effectiveWarning
                ? effectiveLastError
                  ? `${effectiveWarning} (${effectiveLastError})`
                  : effectiveWarning
                : effectiveLastError ?? '최근 경고 없음'
              const lastCheckedLabel = provider.lastSuccessAt
                ? `마지막 정상 확인 ${formatLocalProviderTime(provider.lastSuccessAt)}`
                : provider.lastCheckedAt
                  ? `마지막 확인 ${formatLocalProviderTime(provider.lastCheckedAt)}`
                  : '확인 기록 없음'

              return (
                <article key={provider.provider} className="provider-card provider-card--local">
                  <div className="provider-card__head">
                    <div className="provider-card__identity">
                      <span className={`provider-card__icon provider-card__icon--${provider.provider}`}>
                        <Icon name={localProviderIconName(provider.provider)} size={16} />
                      </span>
                      <div>
                        <h3>{providerLabel}</h3>
                        <p className="settings-card__lead">{localProviderSummary(provider)}</p>
                      </div>
                    </div>
                    <span className={`chip ${provider.ready && !provider.stale ? 'is-active' : 'chip--soft'}`}>
                      {localProviderStatusLabel(provider)}
                    </span>
                  </div>
                  <div className="settings-providerFlags chip-wrap">
                    <span className={`chip ${provider.ready && !provider.stale ? 'is-active' : 'chip--soft'}`}>
                      {provider.ready ? '사용 가능' : '확인 필요'}
                    </span>
                    <span className="chip chip--soft">{provider.models.length}개 모델</span>
                  </div>
                  <p className="provider-card__summary">{provider.detail}</p>
                  <div className="provider-card__surface">
                    <strong>준비 상태</strong>
                    <span>{localProviderStatusLabel(provider)}</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>현재 모델 수</strong>
                    <span>{provider.models.length}개</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>현재 모델명</strong>
                    <span>{currentModelName}</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>최근 경고</strong>
                    <span>{statusMessage}</span>
                  </div>
                  <p className="settings-inlineMeta">{lastCheckedLabel}</p>
                  <div className="settings-actionRow">
                    <button
                      className="ghost-button ghost-button--compact"
                      disabled={isRefreshingLocalProviders}
                      onClick={() => void handleRefreshLocalProviders()}
                      type="button"
                    >
                      {isRefreshingLocalProviders ? '상태 확인 중' : '로컬 상태 새로고침'}
                    </button>
                  </div>
                </article>
              )
              /*
              const providerLabel = localProviderLabel(provider.provider)
              const isOllama = provider.provider === 'ollama'
              const currentModelName =
                provider.models.length > 0
                  ? formatFriendlyModelName(provider.models[0])
                  : isOllama
                    ? '최근 확인된 모델 없음'
                    : '기본 모델 확인 대기 중'
              const statusMessage = provider.warning
                ? provider.lastError
                  ? `${provider.warning} (${provider.lastError})`
                  : provider.warning
                : provider.lastError ?? '최근 경고 없음'
              const lastCheckedLabel = provider.lastSuccessAt
                ? `마지막 정상 확인 ${formatLocalProviderTime(provider.lastSuccessAt)}`
                : provider.lastCheckedAt
                  ? `마지막 확인 ${formatLocalProviderTime(provider.lastCheckedAt)}`
                  : '확인 기록 없음'

              return (
                <article key={provider.provider} className="provider-card provider-card--local">
                  <div className="provider-card__head">
                    <div className="provider-card__identity">
                      <span className={`provider-card__icon provider-card__icon--${provider.provider}`}>
                        <Icon name={localProviderIconName(provider.provider)} size={16} />
                      </span>
                      <div>
                        <h3>{providerLabel}</h3>
                        <p className="settings-card__lead">{localProviderSummary(provider)}</p>
                      </div>
                    </div>
                    <span className={`chip ${provider.ready && !provider.stale ? 'is-active' : 'chip--soft'}`}>
                      {localProviderStatusLabel(provider)}
                    </span>
                  </div>
                  <div className="settings-providerFlags chip-wrap">
                    <span className={`chip ${provider.ready && !provider.stale ? 'is-active' : 'chip--soft'}`}>
                      {provider.ready ? '사용 가능' : '확인 필요'}
                    </span>
                    <span className="chip chip--soft">{provider.models.length}개 모델</span>
                  </div>
                  <p className="provider-card__summary">{provider.detail}</p>
                  <div className="provider-card__surface">
                    <strong>준비 상태</strong>
                    <span>{localProviderStatusLabel(provider)}</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>현재 모델 수</strong>
                    <span>{provider.models.length}개</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>현재 모델명</strong>
                    <span>{currentModelName}</span>
                  </div>
                  <div className="provider-card__surface">
                    <strong>최근 경고</strong>
                    <span>{statusMessage}</span>
                  </div>
                  <p className="settings-inlineMeta">{lastCheckedLabel}</p>
                  <div className="settings-actionRow">
                    <button
                      className="ghost-button ghost-button--compact"
                      disabled={isRefreshingLocalProviders}
                      onClick={() => void handleRefreshLocalProviders()}
                      type="button"
                    >
                      {isRefreshingLocalProviders ? '상태 확인 중' : '로컬 상태 새로고침'}
                    </button>
                  </div>
                </article>
              )
              */
            })}
          </div>
        </DisclosureSection>
      </section>

      <section className="settings-card">
        <DisclosureSection
          className="settings-disclosure"
          defaultOpen
          summary="OpenRouter, NVIDIA Build, Gemini 공식 키 저장과 연결 테스트"
          title="1. 공식 API 공급자"
        >
          <div className="panel-card__header">
            <p className="settings-card__lead">공급자별 키를 저장하고 무료 후보 탐색 상태를 바로 확인합니다.</p>
            <button className="ghost-button ghost-button--compact" disabled={busyKey === 'all:refresh'} onClick={() => void refreshProviderCatalog()} type="button">
              후보 새로고침
            </button>
          </div>
          <div className="provider-grid provider-grid--official">
          {OFFICIAL_PROVIDER_ORDER.map((providerId) => {
            const provider = visibleAiProviders.find((item) => item.provider === providerId)
            const draft = providerDrafts[providerId] ?? { enabled: false, apiKey: '', candidateModelsText: '' }
            if (!provider) return null

            return (
              <article key={provider.provider} className="provider-card provider-card--official">
                <div className="provider-card__head">
                  <div className="provider-card__identity">
                    <span className={`provider-card__icon provider-card__icon--${provider.provider}`}>
                      <Icon name={providerIconName(provider.provider)} size={18} />
                    </span>
                    <div>
                      <h3>{provider.label}</h3>
                      <p className="settings-card__lead">{providerDescription(provider.provider)}</p>
                    </div>
                  </div>
                  <span className={`chip ${provider.status === 'ready' || provider.available_count > 0 ? 'is-active' : 'chip--soft'}`}>
                    {providerStatusLabel(provider)}
                  </span>
                </div>
                <p className="provider-card__summary">{providerAutoSummary(provider.provider)}</p>
                <label className="settings-toggle">
                  <span>이 공급자 사용</span>
                  <input checked={draft.enabled} onChange={(event) => updateDraft(provider.provider, { enabled: event.target.checked })} type="checkbox" />
                </label>
                <div className="settings-providerFlags chip-wrap">
                  <span className="chip chip--soft">무료 후보 {provider.available_count}/{provider.candidate_count}</span>
                  <span className="chip chip--soft">저장된 키 {provider.masked_key || '없음'}</span>
                </div>
                <div className="provider-card__flow">
                  {providerFlowSteps(provider.provider).map((step, index) => (
                    <span key={step} className="provider-card__step">
                      <strong>{index + 1}</strong>
                      <span>{step}</span>
                    </span>
                  ))}
                </div>
                <div className="settings-grid">
                  <label className="field field--full">
                    <span>{provider.label} API 키</span>
                    <input
                      autoComplete="off"
                      type="password"
                      value={draft.apiKey}
                      placeholder={provider.masked_key ? '새 키를 입력하면 교체됩니다.' : '공식 사이트에서 받은 키를 입력하세요.'}
                      onChange={(event) => updateDraft(provider.provider, { apiKey: event.target.value })}
                    />
                    <small className="field__hint">
                      {providerInputHint(provider.provider)} 브라우저에는 마스킹된 상태만 보입니다.
                    </small>
                  </label>
                  <label className="field field--full">
                    <span>기본 후보 목록</span>
                    <textarea
                      rows={4}
                      value={draft.candidateModelsText}
                      placeholder="모델 ID를 줄바꿈으로 입력하거나 비워 두세요."
                      onChange={(event) => updateDraft(provider.provider, { candidateModelsText: event.target.value })}
                    />
                  </label>
                </div>
                <div className="settings-actionRow">
                  <button className="primary-button" disabled={busyKey === `${provider.provider}:save`} onClick={() => void saveProviderConfig(provider.provider)} type="button">저장</button>
                  <button className="ghost-button" disabled={busyKey === `${provider.provider}:test`} onClick={() => void runProviderTest(provider.provider)} type="button">연결 테스트</button>
                  <button className="ghost-button" disabled={busyKey === `${provider.provider}:refresh`} onClick={() => void refreshProviderCatalog(provider.provider)} type="button">이 공급자 새로고침</button>
                </div>
              </article>
            )
          })}
          </div>
        </DisclosureSection>
      </section>

      <section className="settings-card">
        <DisclosureSection
          className="settings-disclosure"
          defaultOpen={false}
          summary="자동 무료 최상, 코딩 최상, 빠른 응답, 수동 선택"
          title="2. 무료 라우팅 정책"
        >
          <div className="panel-card__header">
            <p className="settings-card__lead">자동 모드는 검증된 무료 후보를 점수 순으로 시도하고, 실패하면 다음 후보로 넘어갑니다.</p>
            <span className="chip chip--soft">{aiSettings ? routingModeLabel(aiSettings.routing_mode) : '불러오는 중'}</span>
          </div>
          <div className="settings-modeGrid">
          {aiSettings?.available_modes.map((mode) => (
            <button
              key={mode.id}
              className={`settings-modeCard ${aiSettings.routing_mode === mode.id ? 'is-selected' : ''}`}
              onClick={() => void updateRoutingMode(mode.id)}
              type="button"
            >
              <strong>{mode.label}</strong>
              <small>{mode.description}</small>
            </button>
          ))}
        </div>
        <div className="settings-routePreview">
          <div>
            <span className="settings-routePreview__label">현재 1순위 후보</span>
            <strong>
              {topCandidate
                ? `${topCandidate.provider_label ?? topCandidate.provider} · ${formatFriendlyModelName(topCandidate.display_name)}`
                : '아직 후보가 없습니다'}
            </strong>
          </div>
          {topCandidate ? (
            <div className="chip-wrap">
              <span className="chip chip--soft">품질 {topCandidate.quality_score}</span>
              <span className="chip chip--soft">추론 {topCandidate.reasoning_score}</span>
              <span className="chip chip--soft">코딩 {topCandidate.coding_score}</span>
              <span className="chip chip--soft">속도 {topCandidate.speed_score}</span>
              <span className="chip chip--soft">안정성 {topCandidate.stability_score}</span>
              <span className="chip chip--soft">점수 {topCandidate.score ?? '-'}</span>
            </div>
          ) : null}
        </div>
        <div className="status-banner status-banner--info">
          <Icon name="check" size={16} />
          <span>자동 무료 모드는 검증된 무료 후보를 점수 순서로 시도하고, 실패하면 다음 후보로 자동 폴백합니다.</span>
        </div>
          {aiSettings?.routing_mode === 'manual' ? (
            <div className="settings-apiTargetGrid">
            {manualCandidates.map((candidate) => (
              <button
                key={`${candidate.provider}:${candidate.model_id}`}
                className={`settings-apiTarget ${
                  aiSettings.manual_provider === candidate.provider && aiSettings.manual_model === candidate.model_id ? 'is-selected' : ''
                }`}
                onClick={() => void updateManualCandidate(candidate.provider, candidate.model_id)}
                type="button"
              >
                <strong>{formatFriendlyModelName(candidate.display_name)}</strong>
                <small>{candidate.provider_label ?? candidate.provider}</small>
              </button>
            ))}
            </div>
          ) : null}
        </DisclosureSection>
      </section>

      <section className="settings-card">
        <DisclosureSection
          className="settings-disclosure"
          defaultOpen={false}
          summary="후보 점수, 최근 상태, 제외 여부"
          title="3. 무료 후보 관리"
        >
          <div className="panel-card__header">
          <h2>무료 후보 관리</h2>
          <span className="chip chip--soft">{aiModels.length}개</span>
        </div>
        {aiModels.length > 0 ? (
          <div className="settings-modelCatalog">
            {aiModels.map((model) => (
              <article key={`${model.provider}:${model.model_id}`} className="settings-modelCard">
                <div className="settings-modelCard__header">
                  <div>
                    <strong>{formatFriendlyModelName(model.display_name)}</strong>
                    <small>{model.provider_label ?? model.provider} · {model.model_id}</small>
                  </div>
                  <span className={`chip ${model.verified_available && !model.excluded ? 'is-active' : 'chip--soft'}`}>
                    {model.excluded ? '제외됨' : model.verified_available ? '검증됨' : '미검증'}
                  </span>
                </div>
                <div className="chip-wrap">
                  <span className="chip chip--soft">품질 {model.quality_score}</span>
                  <span className="chip chip--soft">추론 {model.reasoning_score}</span>
                  <span className="chip chip--soft">코딩 {model.coding_score}</span>
                  <span className="chip chip--soft">속도 {model.speed_score}</span>
                </div>
                {model.last_error ? <p className="settings-inlineMeta">{model.last_error}</p> : null}
                <div className="settings-actionRow">
                  <button className={model.excluded ? 'primary-button' : 'ghost-button'} onClick={() => void toggleCandidateExclusion(model)} type="button">
                    {model.excluded ? '제외 해제' : '이 후보 제외'}
                  </button>
                  <span className="settings-inlineMeta">
                    {model.last_checked_at ? `마지막 검증 ${model.last_checked_at}` : '검증 기록 없음'}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="무료 후보가 아직 없습니다" description="공급자 키를 저장하고 연결 테스트를 실행하면 이 목록이 채워집니다." />
          )}
        </DisclosureSection>
      </section>

      <section className="settings-card settings-card--split">
        <DisclosureSection
          className="settings-disclosure"
          defaultOpen={false}
          summary="채팅에 실제로 노출되는 Codex, 공식 무료 라우터, Ollama"
          title="4. 채팅 에이전트"
        >
        <div className="settings-card__side">
          <div className="panel-card__header">
            <h2>채팅 에이전트</h2>
            <span className="chip chip--soft">{managedAgents.length}개</span>
          </div>
          <div className="settings-agentCreateGrid">
            {MANAGED_AGENT_PRESETS.map((presetId) => {
              const preset = getAgentPreset(presetId)
              const exists = managedAgents.some((agent) => agent.preset === presetId)
              return (
                <button
                  key={presetId}
                  className={`settings-presetOption ${exists ? 'is-selected' : ''}`}
                  disabled={exists}
                  onClick={() => createAgent(presetId)}
                  type="button"
                >
                  <span className="settings-presetOption__copy">
                    <strong>{preset.label}</strong>
                    <small>{preset.description}</small>
                  </span>
                  <span className="chip chip--soft">{exists ? '추가됨' : '추가'}</span>
                </button>
              )
            })}
          </div>
          <div className="entity-list">
            {managedAgents.map((agent) => (
              <button
                key={agent.id}
                className={`agent-list-item ${activeManagedAgent?.id === agent.id ? 'is-selected' : ''}`}
                onClick={() => setActiveAgent(agent.id)}
                type="button"
              >
                <div className="agent-list-item__copy">
                  <strong>{agent.name}</strong>
                  <small>{getAgentPreset(agent.preset).label}</small>
                  <small>{agent.model}</small>
                </div>
                <span className={`chip chip--status chip--${agent.status}`}>{agent.status}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-card__main">
          {activeManagedAgent ? (
            <>
              <div className="panel-card__header">
                <h2>선택된 에이전트</h2>
                <div className="settings-actionRow">
                  <button className="ghost-button" onClick={() => onNavigate('chat')} type="button">채팅 열기</button>
                  <button className="ghost-button" onClick={() => onNavigate('agents')} type="button">오케스트레이션 보기</button>
                  <button className="danger-button" disabled={managedAgents.length <= 1} onClick={() => deleteAgent(activeManagedAgent.id)} type="button">
                    삭제
                  </button>
                </div>
              </div>
              {activeManagedAgent.provider === 'official-router' ? (
                <div className="status-banner status-banner--info">
                  <Icon name="check" size={16} />
                  <span>공식 무료 라우터는 저장된 API 키만 사용하고, 무료 후보 중 점수가 가장 높은 모델부터 자동 시도합니다.</span>
                </div>
              ) : null}
              <div className="settings-grid">
                <label className="field">
                  <span>이름</span>
                  <input value={activeManagedAgent.name} onChange={(event) => updateAgent(activeManagedAgent.id, { name: event.target.value })} />
                </label>
                <label className="field">
                  <span>역할</span>
                  <input value={activeManagedAgent.role} onChange={(event) => updateAgent(activeManagedAgent.id, { role: event.target.value })} />
                </label>
                <label className="field field--full">
                  <span>설명</span>
                  <input value={activeManagedAgent.description} onChange={(event) => updateAgent(activeManagedAgent.id, { description: event.target.value })} />
                </label>
                <label className="field">
                  <span>프리셋</span>
                  <input readOnly value={getAgentPreset(activeManagedAgent.preset).label} />
                </label>
                <label className="field">
                  <span>모델</span>
                  <input
                    readOnly={activeManagedAgent.provider === 'official-router'}
                    value={activeManagedAgent.provider === 'official-router' ? routingModeLabel(aiSettings?.routing_mode ?? 'auto-best-free') : activeManagedAgent.model}
                    onChange={(event) => updateAgent(activeManagedAgent.id, { model: event.target.value })}
                  />
                </label>
                <label className="field field--full">
                  <span>기능</span>
                  <div className="chip-wrap">
                    {activeManagedAgent.capabilities.map((capability) => (
                      <span key={capability} className="chip chip--soft">{capabilityLabel(capability)}</span>
                    ))}
                  </div>
                </label>
                <label className="field field--full">
                  <span>시스템 프롬프트</span>
                  <textarea
                    rows={5}
                    value={activeManagedAgent.systemPrompt}
                    onChange={(event) => updateAgent(activeManagedAgent.id, { systemPrompt: event.target.value })}
                  />
                </label>
              </div>
            </>
          ) : (
            <EmptyState title="선택된 에이전트가 없습니다" description="왼쪽에서 채팅 에이전트를 고르면 이름과 역할을 수정할 수 있습니다." />
          )}
        </div>
        </DisclosureSection>
      </section>
    </div>
  )
}

export function SettingsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const { state, updateSettings } = useArtemisApp()
  return (
    <section className="page">
      <PageIntro
        title="설정"
        icon="settings"
        description="실행기 확인, 공식 API 공급자 연결, 무료 후보 라우팅 정책을 한 화면에서 관리합니다."
      />
      <div className="tab-row">
        {settingsTabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${state.settings.activeTab === tab.id ? 'is-active' : ''}`}
            onClick={() => updateSettings({ activeTab: tab.id as SettingsTab })}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {state.settings.activeTab === 'profile' ? <SettingsProfilePane /> : null}
      {state.settings.activeTab === 'models' ? <SettingsModelsPane onNavigate={onNavigate} /> : null}
      {state.settings.activeTab === 'preferences' ? <SettingsPreferencesPane /> : null}
    </section>
  )
}

export default SettingsPage
