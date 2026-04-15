import type {
  AiModelCatalogEntry,
  AiProviderId,
  AiProviderState,
} from '../../lib/aiRoutingClient'
import type { ProviderStatus } from '../../lib/modelClient'
import type { AgentCapability, AgentPresetId } from '../../state/types'

export const MANAGED_AGENT_PRESETS: AgentPresetId[] = ['official-router', 'codex-cli', 'ollama-local']
export const OFFICIAL_PROVIDER_ORDER: AiProviderId[] = ['openrouter', 'nvidia-build', 'gemini']
export const LOCAL_PROVIDER_ORDER = ['ollama', 'codex'] as const

export type LocalProviderId = (typeof LOCAL_PROVIDER_ORDER)[number]

export type ProviderDraft = {
  enabled: boolean
  apiKey: string
  candidateModelsText: string
}

export type LocalProviderCard = ProviderStatus & {
  provider: LocalProviderId
}

export function isDocScreenshotMode() {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem('artemis-doc-screenshot-mode') === '1'
  } catch {
    return false
  }
}

export function capabilityLabel(capability: AgentCapability) {
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

export function providerDescription(provider: AiProviderId) {
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

export function providerIconName(provider: AiProviderId): 'globe' | 'desktop' | 'spark' {
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

export function localProviderLabel(provider: LocalProviderId) {
  return provider === 'ollama' ? 'Ollama 로컬' : 'Codex CLI'
}

export function localProviderIconName(provider: LocalProviderId): 'spark' | 'agent' {
  return provider === 'ollama' ? 'spark' : 'agent'
}

export function formatLocalProviderTime(value?: string | null) {
  if (!value) {
    return '기록 없음'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('ko-KR', { hour12: false })
}

export function localProviderSummary(provider: LocalProviderCard) {
  if (provider.provider === 'ollama') {
    if (provider.ready && provider.stale) {
      return '최근 확인은 실패했지만 마지막 정상 Ollama 상태를 유지하고 있습니다.'
    }

    if (provider.ready) {
      return '로컬 Ollama 모델을 채팅과 오케스트레이션에서 바로 사용할 수 있습니다.'
    }

    if (provider.available) {
      return 'Ollama 서버는 보이지만 모델 상태를 다시 확인해야 합니다.'
    }

    return 'Ollama 실행과 모델 목록 확인이 필요합니다.'
  }

  return provider.ready
    ? 'Codex CLI가 실제 파일 수정과 코드 작업을 처리할 수 있는 상태입니다.'
    : 'Codex CLI 연결 상태를 다시 확인해야 합니다.'
}

export function localProviderStatusLabel(provider: {
  available: boolean
  ready: boolean
  stale?: boolean
}) {
  if (provider.ready && provider.stale) return '마지막 정상 상태'
  if (provider.ready) return '준비 완료'
  if (provider.available) return '부분 준비'
  return '미연결'
}

export function getCurrentLocalModelName(provider: LocalProviderCard) {
  if (provider.models.length > 0) {
    return provider.models[0]
  }

  return provider.provider === 'ollama' ? '최근 확인된 모델 없음' : '기본 모델 확인 대기'
}

export function buildFallbackLocalProvider(
  provider: LocalProviderId,
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
    warning: bridgeError ? '최근 상태 확인이 실패했습니다.' : '상태 확인 중입니다.',
    lastError: bridgeError,
    stale: Boolean(bridgeError),
    lastCheckedAt: null,
    lastSuccessAt: null,
  }
}

export function providerAutoSummary(provider: AiProviderId) {
  switch (provider) {
    case 'openrouter':
      return 'OpenRouter 연결 상태를 확인하고 지정한 모델 ID로 바로 호출합니다.'
    case 'nvidia-build':
      return 'NVIDIA Build 연결 상태를 확인하고 지정한 모델 ID를 직접 사용합니다.'
    case 'gemini':
      return 'Gemini Developer API를 사용해 지정한 모델로 바로 호출합니다.'
    default:
      return '공식 공급자를 연결하고 원하는 모델 ID를 직접 지정합니다.'
  }
}

export function providerInputHint(provider: AiProviderId) {
  switch (provider) {
    case 'openrouter':
      return 'OpenRouter에서 발급한 키를 입력하면 해당 계정 기준 모델을 직접 확인합니다.'
    case 'nvidia-build':
      return 'NVIDIA Build에서 발급한 키를 입력하면 해당 계정 기준 모델을 직접 확인합니다.'
    case 'gemini':
      return 'Gemini Developer API 키를 입력하면 해당 계정 기준 모델을 직접 확인합니다.'
    default:
      return '공식 사이트에서 받은 키만 입력하세요.'
  }
}

export function providerStatusLabel(provider: AiProviderState) {
  if (!provider.enabled) return '비활성'
  if (!provider.configured) return '미설정'
  if (provider.status === 'ready') return '연결 성공'
  if (provider.available_count > 0) return '모델 확인됨'
  if (provider.last_test_status === 'failed') return '연결 실패'
  return '설정 중'
}

function normalizeProviderStatusText(value: string) {
  return value
    .replaceAll(
      '무료 후보를 검증했고 지금 바로 사용할 수 있습니다.',
      '직접 호출 가능한 모델을 확인했고 지금 바로 사용할 수 있습니다.',
    )
    .replaceAll(
      '무료 후보는 보이지만 지금 바로 쓸 수 있는 무료 후보를 찾지 못했습니다',
      '후보는 보이지만 지금 바로 호출 가능한 모델을 찾지 못했습니다',
    )
    .replaceAll(
      'API 키를 사용하려면 무료 후보를 검증합니다.',
      'API 키를 사용하려면 직접 호출 가능한 모델을 검증합니다.',
    )
}

export function providerRecentStatus(provider: AiProviderState) {
  if (provider.last_test_message) {
    return normalizeProviderStatusText(provider.last_test_message)
  }

  if (provider.detail) {
    return normalizeProviderStatusText(provider.detail)
  }

  if (provider.status === 'ready') {
    return '연결 테스트를 통과했습니다.'
  }

  if (provider.configured) {
    return '키는 등록됐고 연결 테스트를 기다리고 있습니다.'
  }

  return '아직 설정되지 않았습니다.'
}

export function providerRecentCheckedLabel(provider: AiProviderState) {
  const value = provider.last_test_at ?? provider.checked_at ?? provider.updated_at

  if (!value) {
    return '아직 연결 테스트 기록이 없습니다.'
  }

  return `마지막 확인 ${formatLocalProviderTime(value)}`
}

export function buildProviderDrafts(providers: AiProviderState[]) {
  return providers.reduce<Record<string, ProviderDraft>>((accumulator, provider) => {
    accumulator[provider.provider] = {
      enabled: provider.enabled,
      apiKey: '',
      candidateModelsText: provider.candidate_models.join('\n'),
    }
    return accumulator
  }, {})
}

export function parseModelListInput(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function buildInlineModelChoice(provider: AiProviderId, modelId: string): AiModelCatalogEntry {
  return {
    provider,
    model_id: modelId,
    display_name: modelId,
    free_candidate: false,
    verified_available: false,
    supports_streaming: true,
    supports_tools: false,
    supports_vision: false,
    quality_score: 0,
    reasoning_score: 0,
    coding_score: 0,
    speed_score: 0,
    stability_score: 0,
    priority: 0,
    excluded: false,
    last_checked_at: null,
    last_error: '',
    notes: '직접 입력한 모델',
  }
}
