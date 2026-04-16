import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PageId } from '../../crewData'
import {
  fetchAiModels,
  fetchAiProviders,
  fetchAiSettings,
  refreshAiModels,
  saveAiProvider,
  saveAiSettings,
  testAiProvider,
  type AiModelCatalogEntry,
  type AiProviderId,
  type AiProviderState,
  type AiRoutingSettings,
} from '../../lib/aiRoutingClient'
import { formatFriendlyModelName } from '../../crewPageHelpers'
import { useArtemisApp } from '../../state/context'
import { SettingsLocalProvidersSection } from './SettingsLocalProvidersSection'
import { SettingsManagedAgentsSection } from './SettingsManagedAgentsSection'
import { SettingsOfficialProvidersSection } from './SettingsOfficialProvidersSection'
import { SettingsOfficialTargetSection } from './SettingsOfficialTargetSection'
import { SettingsOverviewSection } from './SettingsOverviewSection'
import {
  buildFallbackLocalProvider,
  buildInlineModelChoice,
  buildProviderDrafts,
  isDocScreenshotMode,
  MANAGED_AGENT_PRESETS,
  OFFICIAL_PROVIDER_ORDER,
  parseModelListInput,
  providerDescription,
  type LocalProviderCard,
  type ProviderDraft,
} from './settingsModelsShared'

export function SettingsModelsPane({ onNavigate }: { onNavigate: (page: PageId) => void }) {
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
  } = useArtemisApp()
  const [aiProviders, setAiProviders] = useState<AiProviderState[]>([])
  const [aiModels, setAiModels] = useState<AiModelCatalogEntry[]>([])
  const [aiSettings, setAiSettings] = useState<AiRoutingSettings | null>(null)
  const [providerDrafts, setProviderDrafts] = useState<Record<string, ProviderDraft>>({})
  const [aiError, setAiError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [isRefreshingLocalProviders, setIsRefreshingLocalProviders] = useState(false)
  const [officialProviderDraft, setOfficialProviderDraft] = useState<AiProviderId>('openrouter')
  const [officialModelDraft, setOfficialModelDraft] = useState('')
  const docScreenshotMode = useMemo(() => isDocScreenshotMode(), [])

  const managedAgents = useMemo(
    () => state.agents.items.filter((agent) => MANAGED_AGENT_PRESETS.includes(agent.preset)),
    [state.agents.items],
  )
  const activeManagedAgent =
    (activeAgent && MANAGED_AGENT_PRESETS.includes(activeAgent.preset) ? activeAgent : null) ??
    managedAgents[0] ??
    null
  const officialAgents = useMemo(
    () => state.agents.items.filter((agent) => agent.provider === 'official-router'),
    [state.agents.items],
  )

  const localProviders = useMemo(() => {
    const providerMap = new Map(
      (bridgeHealth?.providers ?? [])
        .filter(
          (item): item is LocalProviderCard =>
            item.provider === 'ollama' || item.provider === 'codex',
        )
        .map((item) => [item.provider, item]),
    )

    return ['ollama', 'codex'].map(
      (provider) =>
        providerMap.get(provider as LocalProviderCard['provider']) ??
        buildFallbackLocalProvider(provider as LocalProviderCard['provider'], bridgeError),
    )
  }, [bridgeError, bridgeHealth])

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
        .filter((item) => !item.excluded)
        .sort(
          (left, right) =>
            (right.score ?? right.quality_score) - (left.score ?? left.quality_score),
        ),
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
    () => visibleAiProviders.filter((item) => item.enabled && item.configured).length,
    [visibleAiProviders],
  )
  const enabledOfficialProviders = useMemo(
    () => visibleAiProviders.filter((item) => item.enabled).length,
    [visibleAiProviders],
  )
  const selectedOfficialPinnedModels = useMemo(
    () => parseModelListInput(providerDrafts[officialProviderDraft]?.candidateModelsText ?? ''),
    [officialProviderDraft, providerDrafts],
  )
  const selectedOfficialModelChoices = useMemo(() => {
    const providerCandidates = manualCandidates.filter((item) => item.provider === officialProviderDraft)
    const candidateMap = new Map(providerCandidates.map((item) => [item.model_id, item]))
    const preferredIds = [officialModelDraft.trim(), ...selectedOfficialPinnedModels].filter(Boolean)
    const selected: AiModelCatalogEntry[] = []
    const seen = new Set<string>()

    preferredIds.forEach((modelId) => {
      if (seen.has(modelId)) {
        return
      }

      selected.push(candidateMap.get(modelId) ?? buildInlineModelChoice(officialProviderDraft, modelId))
      seen.add(modelId)
    })

    providerCandidates.forEach((candidate) => {
      if (seen.has(candidate.model_id)) {
        return
      }

      selected.push(candidate)
      seen.add(candidate.model_id)
    })

    return selected.slice(0, 12)
  }, [manualCandidates, officialModelDraft, officialProviderDraft, selectedOfficialPinnedModels])

  const loadAiState = useCallback(async () => {
    try {
      const [providers, settings, models] = await Promise.all([
        fetchAiProviders(state.settings.bridgeUrl),
        fetchAiSettings(state.settings.bridgeUrl),
        fetchAiModels(state.settings.bridgeUrl, { includeExcluded: true }),
      ])

      setAiProviders(providers)
      setAiSettings(settings)
      setAiModels(models)
      setProviderDrafts(buildProviderDrafts(providers))
      setOfficialProviderDraft(settings.manual_provider ?? 'openrouter')
      setOfficialModelDraft(settings.manual_model ?? '')
      setAiError(null)
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 설정을 불러오지 못했습니다.')
    }
  }, [state.settings.bridgeUrl])

  useEffect(() => {
    void loadAiState()
  }, [loadAiState])

  const updateDraft = useCallback((provider: AiProviderId, patch: Partial<ProviderDraft>) => {
    setProviderDrafts((drafts) => ({
      ...drafts,
      [provider]: {
        enabled: patch.enabled ?? drafts[provider]?.enabled ?? false,
        apiKey: patch.apiKey ?? drafts[provider]?.apiKey ?? '',
        candidateModelsText: patch.candidateModelsText ?? drafts[provider]?.candidateModelsText ?? '',
      },
    }))
  }, [])

  const syncOfficialAgents = useCallback(
    (provider: AiProviderId, modelId: string) => {
      const normalizedModel = modelId.trim()
      if (!normalizedModel) {
        return
      }

      officialAgents.forEach((agent) => {
        if (agent.baseUrl !== provider || agent.model !== normalizedModel) {
          updateAgent(agent.id, {
            baseUrl: provider,
            model: normalizedModel,
            description: `${providerDescription(provider)}로 ${normalizedModel} 모델을 직접 실행합니다.`,
          })
        }
      })
    },
    [officialAgents, updateAgent],
  )

  useEffect(() => {
    if (!aiSettings?.manual_provider || !aiSettings.manual_model) {
      return
    }

    syncOfficialAgents(aiSettings.manual_provider, aiSettings.manual_model)
  }, [aiSettings, syncOfficialAgents])

  const handleRefreshLocalProviders = useCallback(async () => {
    setIsRefreshingLocalProviders(true)
    try {
      await refreshBridgeHealth()
    } finally {
      setIsRefreshingLocalProviders(false)
    }
  }, [refreshBridgeHealth])

  const saveProviderConfig = useCallback(
    async (provider: AiProviderId) => {
      const draft = providerDrafts[provider]
      setBusyKey(`${provider}:save`)
      try {
        await saveAiProvider(state.settings.bridgeUrl, provider, {
          enabled: draft?.enabled ?? false,
          apiKey: draft?.apiKey.trim() ? draft.apiKey.trim() : undefined,
          candidateModels: parseModelListInput(draft?.candidateModelsText ?? ''),
        })
        await loadAiState()
        updateDraft(provider, { apiKey: '' })
      } catch (error) {
        setAiError(error instanceof Error ? error.message : '공급자 저장에 실패했습니다.')
      } finally {
        setBusyKey(null)
      }
    },
    [loadAiState, providerDrafts, state.settings.bridgeUrl, updateDraft],
  )

  const runProviderTest = useCallback(
    async (provider: AiProviderId) => {
      setBusyKey(`${provider}:test`)
      try {
        await testAiProvider(state.settings.bridgeUrl, provider)
        await loadAiState()
      } catch (error) {
        setAiError(error instanceof Error ? error.message : '연결 테스트에 실패했습니다.')
      } finally {
        setBusyKey(null)
      }
    },
    [loadAiState, state.settings.bridgeUrl],
  )

  const refreshProviderCatalog = useCallback(
    async (provider?: AiProviderId) => {
      setBusyKey(provider ? `${provider}:refresh` : 'all:refresh')
      try {
        await refreshAiModels(state.settings.bridgeUrl, provider)
        await loadAiState()
      } catch (error) {
        setAiError(error instanceof Error ? error.message : '모델 목록 새로고침에 실패했습니다.')
      } finally {
        setBusyKey(null)
      }
    },
    [loadAiState, state.settings.bridgeUrl],
  )

  const saveOfficialTarget = useCallback(
    async (provider: AiProviderId, modelId: string) => {
      const normalizedModel = modelId.trim()
      if (!normalizedModel) {
        setAiError('공식 API에서 사용할 모델 ID를 입력해 주세요.')
        return
      }

      setBusyKey('official-target')
      setOfficialProviderDraft(provider)
      setOfficialModelDraft(normalizedModel)
      try {
        await saveAiSettings(state.settings.bridgeUrl, {
          routing_mode: 'manual',
          manual_provider: provider,
          manual_model: normalizedModel,
        })
        syncOfficialAgents(provider, normalizedModel)
        await loadAiState()
      } catch (error) {
        setAiError(error instanceof Error ? error.message : '공식 API 기본 대상을 저장하지 못했습니다.')
      } finally {
        setBusyKey(null)
      }
    },
    [loadAiState, state.settings.bridgeUrl, syncOfficialAgents],
  )

  const currentOfficialTargetLabel = aiSettings?.manual_model
    ? formatFriendlyModelName(aiSettings.manual_model)
    : '미설정'
  const currentOfficialTargetDetail = aiSettings?.manual_provider
    ? providerDescription(aiSettings.manual_provider)
    : '공급자 선택 필요'

  return (
    <div className="stack-grid">
      <SettingsOverviewSection
        aiError={aiError}
        bridgeError={bridgeError}
        currentOfficialTargetDetail={currentOfficialTargetDetail}
        currentOfficialTargetLabel={currentOfficialTargetLabel}
        enabledOfficialProviders={enabledOfficialProviders}
        isRefreshingLocalProviders={isRefreshingLocalProviders}
        localProviderCount={localProviders.length}
        officialProviderCount={OFFICIAL_PROVIDER_ORDER.length}
        readyLocalProviders={readyLocalProviders}
        readyOfficialProviders={readyOfficialProviders}
        showingCachedLocalState={showingCachedLocalState}
        onNavigate={onNavigate}
        onRefreshLocalProviders={() => void handleRefreshLocalProviders()}
      />

      <SettingsLocalProvidersSection
        bridgeError={bridgeError}
        isRefreshingLocalProviders={isRefreshingLocalProviders}
        localProviders={localProviders}
        onRefreshLocalProviders={() => void handleRefreshLocalProviders()}
      />

      <SettingsOfficialProvidersSection
        busyKey={busyKey}
        providerDrafts={providerDrafts}
        providers={visibleAiProviders}
        onRefreshProviderCatalog={refreshProviderCatalog}
        onRunProviderTest={runProviderTest}
        onSaveProviderConfig={saveProviderConfig}
        onUpdateDraft={updateDraft}
      />

      <SettingsOfficialTargetSection
        aiSettings={aiSettings}
        busyKey={busyKey}
        officialModelDraft={officialModelDraft}
        officialProviderDraft={officialProviderDraft}
        providers={visibleAiProviders}
        selectedOfficialModelChoices={selectedOfficialModelChoices}
        onOfficialModelChange={setOfficialModelDraft}
        onOfficialProviderChange={setOfficialProviderDraft}
        onRefreshProviderCatalog={refreshProviderCatalog}
        onSaveOfficialTarget={saveOfficialTarget}
      />

      <SettingsManagedAgentsSection
        activeManagedAgent={activeManagedAgent}
        aiSettings={aiSettings}
        managedAgents={managedAgents}
        onCreateAgent={createAgent}
        onDeleteAgent={deleteAgent}
        onNavigate={onNavigate}
        onSetActiveAgent={setActiveAgent}
        onUpdateAgent={updateAgent}
      />
    </div>
  )
}
