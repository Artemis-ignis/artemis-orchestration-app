import type { ToolItem } from './state/types'

export function normalizeUiText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function hasHangulText(value: string | null | undefined) {
  return /[가-힣]/.test(normalizeUiText(value))
}

export function preferLocalizedPreview(value: string | null | undefined) {
  const normalized = normalizeUiText(value)

  if (!normalized || !hasHangulText(normalized)) {
    return normalized
  }

  const segments = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return normalized
  }

  const kept: string[] = []

  for (const segment of segments) {
    const segmentHasHangul = hasHangulText(segment)

    if (!segmentHasHangul && kept.length > 0 && segment.length > 32) {
      break
    }

    kept.push(segment)
  }

  return kept.join(' ').trim() || normalized
}

export function clipUiText(value: string | null | undefined, maxLength = 140) {
  const normalized = normalizeUiText(value)

  if (!normalized) {
    return ''
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

export function formatDate(value: string) {
  if (!value) {
    return '시간 미상'
  }

  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(value: string) {
  if (!value) {
    return '방금 전'
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000))

  if (diffMinutes < 1) return '방금 전'
  if (diffMinutes < 60) return `${diffMinutes}분 전`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}시간 전`

  return `${Math.round(diffHours / 24)}일 전`
}

export function bytesLabel(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

export function getRelativeParentPath(value: string) {
  return value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : ''
}

export function pageLabel(value: string) {
  switch (value) {
    case 'chat':
      return '채팅'
    case 'files':
      return '내 파일'
    case 'signals':
      return '시그널'
    case 'tools':
      return '스킬'
    case 'settings':
      return '설정'
    case 'agents':
      return '오케스트레이션'
    case 'activity':
      return '활동'
    case 'insights':
      return '인사이트'
    default:
      return value
  }
}

export function sourceLabel(value: ToolItem['source']) {
  switch (value) {
    case 'local-skill':
      return '로컬 스킬'
    case 'plugin-skill':
      return '플러그인 스킬'
    default:
      return value
  }
}

export function providerLabel(value: string) {
  switch (value) {
    case 'ollama':
      return 'Ollama'
    case 'codex':
      return 'Codex CLI'
    case 'official-router':
      return '공식 API'
    case 'openai-compatible':
      return 'OpenAI 호환 API'
    case 'anthropic':
      return 'Claude API'
    case 'openrouter':
      return '오픈라우터'
    case 'nvidia-build':
      return '엔비디아 빌드'
    case 'gemini':
      return 'Gemini'
    case 'openai-direct':
      return 'OpenAI API'
    case 'gemini-openai':
      return 'Gemini API'
    case 'claude-anthropic':
      return 'Claude API'
    case 'openrouter-free':
      return '오픈라우터'
    case 'aihubmix-free':
      return 'AIHubMix'
    case 'nvidia-trial':
      return '엔비디아 NIM'
    case 'arxiv':
      return 'arXiv'
    case 'crossref':
      return 'Crossref'
    case 'semantic-scholar':
      return 'Semantic Scholar'
    case 'news-api':
      return 'News API'
    case 'rss':
      return 'RSS'
    case 'legacy-signals':
      return '시그널 수집'
    case 'auto':
      return '자동'
    default:
      return value
  }
}

export function executionProviderLabel(value: string) {
  return providerLabel(value)
}

export function changeTypeLabel(value: 'created' | 'modified' | 'deleted') {
  switch (value) {
    case 'created':
      return '생성'
    case 'modified':
      return '수정'
    case 'deleted':
      return '삭제'
    default:
      return value
  }
}

export function signalSourceLabel(value: string) {
  switch (value.toLowerCase()) {
    case 'github':
      return 'GitHub'
    case 'hacker news':
      return '해커 뉴스'
    case 'arxiv':
      return 'arXiv'
    default:
      return value
  }
}

export function formatFriendlyModelName(model: string) {
  const normalized = model.trim().replace(/:latest$/i, '')

  if (!normalized) {
    return '모델 선택'
  }

  if (/^gpt-/i.test(normalized)) {
    return normalized
      .replace(/^gpt-/i, 'GPT-')
      .replace(/-mini$/i, ' Mini')
      .replace(/-nano$/i, ' Nano')
  }

  if (/^gemini-/i.test(normalized)) {
    return normalized
      .replace(/^gemini-/i, 'Gemini ')
      .replace(/-/g, ' ')
      .replace(/\bflash\b/i, 'Flash')
      .replace(/\bpro\b/i, 'Pro')
  }

  if (/claude-sonnet-4/i.test(normalized)) {
    return 'Claude Sonnet 4'
  }

  if (/claude-opus-4/i.test(normalized)) {
    return 'Claude Opus 4'
  }

  if (/^gemma/i.test(normalized)) {
    if (/^gemma4-E4B-uncensored-q4fast$/i.test(normalized)) {
      return 'gemma4 E4B uncensored q4fast'
    }

    return normalized.replace(/^gemma/i, 'gemma').replace(/:/g, ' ')
  }

  return normalized
}

export function routingModeLabel(value: string) {
  switch (value) {
    case 'manual':
      return '직접 호출'
    case 'auto-best-free':
      return '자동 선택'
    case 'auto-best-free-coding':
      return '코딩 우선 자동 선택'
    case 'auto-best-free-fast':
      return '속도 우선 자동 선택'
    default:
      return value
  }
}

export function routingFailureLabel(
  errorType: string | null | undefined,
  fallbackReason: string | null | undefined,
  errorMessage?: string | null | undefined,
) {
  const reason = normalizeUiText(fallbackReason)
  const type = normalizeUiText(errorType).toLowerCase()
  const message = normalizeUiText(errorMessage)
  const source = `${type} ${reason} ${message}`.toLowerCase()

  if (!source) {
    return '다음 후보로 전환'
  }
  if (/api.?key|unauthorized|forbidden|401|403|auth/.test(source)) {
    return '인증 확인 필요'
  }
  if (/timeout|timed out|idle-timeout|stream/.test(source)) {
    return '응답 지연으로 재시도'
  }
  if (/rate.?limit|429/.test(source)) {
    return '요청 한도 도달'
  }
  if (/workspace|folder|root path/.test(source)) {
    return '작업 폴더 확인 필요'
  }
  if (/not.?configured|disabled|not ready|unavailable|empty model|manual_model/.test(source)) {
    return '설정 확인 필요'
  }
  if (/network|fetch failed|econnrefused|connect/.test(source)) {
    return '연결 확인 필요'
  }

  return reason || message || '다음 후보로 전환'
}

export function sanitizeOperatorMessage(value: string | null | undefined, fallback: string) {
  const text = normalizeUiText(value)

  if (!text) {
    return fallback
  }

  try {
    const parsed = JSON.parse(text) as { ok?: boolean; error?: string; message?: string }
    if (parsed && typeof parsed === 'object' && parsed.ok === false) {
      return sanitizeOperatorMessage(parsed.error || parsed.message, fallback)
    }
  } catch {
    // plain text
  }

  const lower = text.toLowerCase()

  if (/작업 폴더를 찾지 못했습니다|workspace.+not found|workspace root/i.test(text)) {
    return '작업 폴더를 찾지 못했습니다. 파일 화면에서 작업 폴더를 다시 연결해 주세요.'
  }

  if (/official api model id is empty|manual_model|model id is empty/.test(lower)) {
    return '공식 API 모델이 비어 있습니다. 설정에서 모델을 다시 선택해 주세요.'
  }

  if (/openai-compatible/.test(lower) && /(api key|키)/.test(lower)) {
    return 'OpenAI 호환 API 키를 연결해 주세요.'
  }

  if (/(anthropic|claude)/.test(lower) && /(api key|키)/.test(lower)) {
    return 'Claude API 키를 연결해 주세요.'
  }

  if (/(fetch failed|networkerror|econnrefused|failed to fetch)/.test(lower)) {
    return '로컬 브리지에 연결하지 못했습니다. 브리지가 실행 중인지 확인해 주세요.'
  }

  if (/(timeout|timed out|idle-timeout)/.test(lower)) {
    return '응답이 지연되고 있습니다. 잠시 뒤 다시 시도해 주세요.'
  }

  if (/forbidden|unauthorized|401|403/.test(lower)) {
    return '공급자 인증에 실패했습니다. 설정에서 연결 상태를 다시 확인해 주세요.'
  }

  if (/no such file|enoent/.test(lower)) {
    return '필요한 파일을 찾지 못했습니다. 경로를 다시 확인해 주세요.'
  }

  if (/invalid json|unexpected token/.test(lower)) {
    return '응답 형식을 해석하지 못했습니다. 다시 시도해 주세요.'
  }

  return text
}
