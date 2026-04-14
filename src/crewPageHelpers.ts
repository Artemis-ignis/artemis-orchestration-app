import type { ToolItem } from './state/types'

export function formatDate(value: string) {
  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelative(value: string) {
  const diffMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  )

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
    case 'openai-compatible':
      return 'OpenAI 호환 API'
    case 'anthropic':
      return 'Anthropic API'
    case 'auto':
      return '자동'
    default:
      return value
  }
}

export function executionProviderLabel(value: string) {
  switch (value) {
    case 'codex':
      return 'Codex CLI'
    case 'ollama':
      return 'Ollama'
    case 'openai-compatible':
      return 'OpenAI 호환 API'
    case 'anthropic':
      return 'Anthropic API'
    default:
      return value
  }
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

    return normalized
      .replace(/^gemma/i, 'gemma')
      .replace(/:/g, ' ')
  }

  return normalized
}
