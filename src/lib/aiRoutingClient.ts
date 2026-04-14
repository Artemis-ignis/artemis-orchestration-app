export type AiProviderId = 'openrouter' | 'nvidia-build' | 'gemini'

export type AiRoutingMode =
  | 'auto-best-free'
  | 'auto-best-free-coding'
  | 'auto-best-free-fast'
  | 'manual'

export type AiProviderState = {
  provider: AiProviderId
  label: string
  enabled: boolean
  auth_type: string
  masked_key: string
  candidate_models: string[]
  created_at: string | null
  updated_at: string | null
  last_test_at: string | null
  last_test_status: string | null
  last_test_message: string
  configured: boolean
  status: string
  detail: string
  available_count: number
  candidate_count: number
  checked_at: string | null
}

export type AiModelCatalogEntry = {
  provider: AiProviderId
  model_id: string
  display_name: string
  free_candidate: boolean
  verified_available: boolean
  supports_streaming: boolean
  supports_tools: boolean
  supports_vision: boolean
  quality_score: number
  reasoning_score: number
  coding_score: number
  speed_score: number
  stability_score: number
  priority: number
  excluded: boolean
  last_checked_at: string | null
  last_error: string
  notes: string
  source?: string
  score?: number
  provider_label?: string
  failure_penalty?: number
}

export type AiRoutingAttemptLog = {
  id: string
  session_id?: string | null
  message_id?: string | null
  routing_mode: AiRoutingMode
  attempt_index: number
  provider: AiProviderId
  model: string
  started_at: string
  first_token_at?: string | null
  ended_at?: string | null
  success: boolean
  error_type?: string | null
  error_message?: string | null
  status_code?: number | null
  latency_ms?: number | null
  fallback_reason?: string | null
  score_at_selection: number
}

export type AiRoutingMessageMeta = {
  routing_mode: AiRoutingMode
  final_provider: AiProviderId
  final_provider_label: string
  final_model: string
  final_display_name: string
  first_token_at?: string | null
  score_at_selection: number
  attempts: AiRoutingAttemptLog[]
}

export type AiStreamMetaEvent = {
  session_id: string
  routing_mode: AiRoutingMode
  candidate_count: number
  top_candidate: {
    provider: AiProviderId
    provider_label: string
    model: string
    display_name: string
    score: number
  } | null
}

export type AiStreamAttemptEvent = {
  attempt_index: number
  provider: AiProviderId
  provider_label: string
  model: string
  display_name?: string
  started_at?: string
  score_at_selection: number
  error_type?: string | null
  error_message?: string | null
  status_code?: number | null
  fallback_reason?: string | null
}

export type AiStreamFinalEvent = {
  session_id: string
  message_id: string
  provider: AiProviderId
  provider_label: string
  model: string
  display_name: string
  text: string
  routing_mode: AiRoutingMode
  attempts: AiRoutingAttemptLog[]
  first_token_at?: string | null
  score_at_selection: number
}

export type AiStreamCallbacks = {
  onMeta?: (meta: AiStreamMetaEvent) => void
  onAttempt?: (attempt: AiStreamAttemptEvent) => void
  onAttemptFailed?: (attempt: AiStreamAttemptEvent) => void
  onToken?: (token: string) => void
  onFinal?: (payload: AiStreamFinalEvent) => void
  onError?: (error: string) => void
  signal?: AbortSignal
}

export type AiRoutingSettings = {
  routing_mode: AiRoutingMode
  manual_provider: AiProviderId | null
  manual_model: string | null
  updated_at: string | null
  available_modes: Array<{
    id: AiRoutingMode
    label: string
    description: string
  }>
  weights: Record<string, Record<string, number>>
}

const STREAM_IDLE_TIMEOUT_MS = 45_000

export type AiRoutePreview = {
  mode: AiRoutingMode
  weights: Record<string, number>
  candidates: AiModelCatalogEntry[]
}

type JsonOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function fetchJson<T>(bridgeUrl: string, routePath: string, options: JsonOptions = {}) {
  const response = await fetch(`${bridgeUrl}${routePath}`, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error ?? `요청이 실패했습니다. (${response.status})`)
  }

  return payload as T
}

function parseSseChunk(part: string) {
  const lines = part
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  let eventName = 'message'
  const dataLines = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  return {
    eventName,
    data: JSON.parse(dataLines.join('\n')),
  }
}

export async function fetchAiProviders(bridgeUrl: string) {
  const payload = await fetchJson<{ providers: AiProviderState[] }>(bridgeUrl, '/api/ai/providers')
  return payload.providers
}

export async function saveAiProvider(
  bridgeUrl: string,
  provider: AiProviderId,
  payload: {
    enabled: boolean
    apiKey?: string
    candidateModels?: string[]
    authType?: string
  },
) {
  const result = await fetchJson<{ provider: AiProviderState }>(
    bridgeUrl,
    `/api/ai/providers/${provider}/save`,
    { method: 'POST', body: payload },
  )
  return result.provider
}

export async function testAiProvider(bridgeUrl: string, provider: AiProviderId) {
  return fetchJson<{
    ok: boolean
    provider: AiProviderId
    status: string
    message: string
    model?: string
  }>(bridgeUrl, `/api/ai/providers/${provider}/test`, {
    method: 'POST',
    body: {},
  })
}

export async function fetchAiModels(
  bridgeUrl: string,
  options: { provider?: AiProviderId; includeExcluded?: boolean } = {},
) {
  const search = new URLSearchParams()
  if (options.provider) {
    search.set('provider', options.provider)
  }
  if (options.includeExcluded) {
    search.set('includeExcluded', 'true')
  }

  const suffix = search.toString() ? `?${search.toString()}` : ''
  const payload = await fetchJson<{ models: AiModelCatalogEntry[] }>(
    bridgeUrl,
    `/api/ai/models${suffix}`,
  )
  return payload.models
}

export async function refreshAiModels(bridgeUrl: string, provider?: AiProviderId) {
  const payload = await fetchJson<{ models: AiModelCatalogEntry[] }>(
    bridgeUrl,
    '/api/ai/models/refresh',
    {
      method: 'POST',
      body: provider ? { provider } : {},
    },
  )
  return payload.models
}

export async function fetchAiSettings(bridgeUrl: string) {
  return fetchJson<AiRoutingSettings & { ok: true }>(bridgeUrl, '/api/ai/settings')
}

export async function saveAiSettings(
  bridgeUrl: string,
  payload: Partial<AiRoutingSettings> & {
    exclusions?: Array<{ provider: AiProviderId; model_id: string; excluded: boolean }>
  },
) {
  return fetchJson<AiRoutingSettings & { ok: true }>(bridgeUrl, '/api/ai/settings', {
    method: 'POST',
    body: payload,
  })
}

export async function previewAiRoute(
  bridgeUrl: string,
  payload: Partial<{
    routing_mode: AiRoutingMode
    manual_provider: AiProviderId | null
    manual_model: string | null
  }> = {},
) {
  return fetchJson<AiRoutePreview & { ok: true }>(bridgeUrl, '/api/ai/route/preview', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchAiRoutingLogs(bridgeUrl: string, limit = 100) {
  const payload = await fetchJson<{ items: AiRoutingAttemptLog[] }>(
    bridgeUrl,
    `/api/ai/routing/logs?limit=${limit}`,
  )
  return payload.items
}

export async function streamAiChat(
  bridgeUrl: string,
  payload: {
    sessionId?: string
    prompt: string
    messages: Array<{ role: 'master' | 'assistant'; text: string }>
    routing_mode?: AiRoutingMode
    manual_provider?: AiProviderId | null
    manual_model?: string | null
    systemPrompt?: string
  },
  handlers: AiStreamCallbacks,
) {
  const response = await fetch(`${bridgeUrl}/api/ai/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: handlers.signal,
  })

  if (!response.ok || !response.body) {
    throw new Error(`스트리밍 연결에 실패했습니다. (${response.status})`)
  }

  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let streamTimedOut = false

  const resetIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
    idleTimer = setTimeout(() => {
      streamTimedOut = true
      reader.cancel('stream-idle-timeout').catch(() => {})
    }, STREAM_IDLE_TIMEOUT_MS)
  }

  const dispatchPart = (part: string) => {
    const parsed = parseSseChunk(part)
    if (!parsed) {
      return
    }

    const { eventName, data } = parsed
    switch (eventName) {
      case 'meta':
        handlers.onMeta?.(data as AiStreamMetaEvent)
        break
      case 'attempt':
        handlers.onAttempt?.(data as AiStreamAttemptEvent)
        break
      case 'attempt_failed':
        handlers.onAttemptFailed?.(data as AiStreamAttemptEvent)
        break
      case 'token':
        if (typeof data.content === 'string') {
          handlers.onToken?.(data.content)
        }
        break
      case 'final':
        handlers.onFinal?.(data as AiStreamFinalEvent)
        break
      case 'error':
        handlers.onError?.(String(data.message ?? '스트리밍 오류가 발생했습니다.'))
        break
      default:
        break
    }
  }

  resetIdleTimer()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      resetIdleTimer()
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        dispatchPart(part)
      }
    }
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
    reader.releaseLock()
  }

  if (buffer.trim()) {
    dispatchPart(buffer)
  }

  if (streamTimedOut) {
    throw new Error('스트리밍이 중간에 멈춰 응답 대기 시간이 초과되었습니다.')
  }
}
