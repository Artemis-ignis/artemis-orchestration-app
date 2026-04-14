import { getProviderLabel, normalizeProviderId } from './config.mjs'

function nowIso() {
  return new Date().toISOString()
}

function extractOpenAiText(payload = {}) {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : null
  const content = choice?.message?.content
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .join('')
  }
  return ''
}

function createProviderError({ provider, type, message, statusCode = null, retryable = false }) {
  const error = new Error(message)
  error.provider = provider
  error.type = type
  error.statusCode = statusCode
  error.retryable = retryable
  return error
}

function parseStatusErrorType(statusCode, message) {
  if (statusCode === 401) {
    return 'auth'
  }
  if (statusCode === 402 || statusCode === 403) {
    return /quota|billing|payment|free/i.test(message) ? 'billing' : 'permission'
  }
  if (statusCode === 404) {
    return 'model_unavailable'
  }
  if (statusCode === 408) {
    return 'timeout'
  }
  if (statusCode === 429) {
    return 'rate_limit'
  }
  if (statusCode >= 500) {
    return 'upstream'
  }
  return 'request'
}

async function readJsonSafe(response) {
  const text = await response.text()
  if (!text) {
    return {}
  }
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

function parseSseChunk(part) {
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
    data: dataLines.join('\n'),
  }
}

async function readSseStream(response, {
  provider,
  onEvent,
  firstTokenTimeoutMs,
  idleTimeoutMs = 45_000,
}) {
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let buffer = ''
  let firstEventTimer = null
  let idleTimer = null
  let streamTimedOut = false

  if (firstTokenTimeoutMs > 0) {
    firstEventTimer = setTimeout(() => {
      reader.cancel('first-token-timeout').catch(() => {})
    }, firstTokenTimeoutMs)
  }

  const resetIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
    if (idleTimeoutMs > 0) {
      idleTimer = setTimeout(() => {
        streamTimedOut = true
        reader.cancel('stream-idle-timeout').catch(() => {})
      }, idleTimeoutMs)
    }
  }

  const dispatchPart = async (part) => {
    const parsed = parseSseChunk(part)
    if (!parsed) {
      return
    }

    if (firstEventTimer) {
      clearTimeout(firstEventTimer)
      firstEventTimer = null
    }
    await onEvent({ event: parsed.eventName, data: parsed.data })
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
        await dispatchPart(part)
      }
    }
  } finally {
    if (firstEventTimer) {
      clearTimeout(firstEventTimer)
    }
    if (idleTimer) {
      clearTimeout(idleTimer)
    }
    reader.releaseLock()
  }

  if (buffer.trim()) {
    await dispatchPart(buffer)
  }

  if (streamTimedOut) {
    throw createProviderError({
      provider,
      type: 'timeout',
      message: '스트리밍이 중간에 멈춰 응답 대기 시간이 초과되었습니다.',
      retryable: true,
    })
  }
}

function normalizeMessages(messages = [], prompt = '') {
  const normalized = []
  for (const message of messages) {
    if (!message || (message.role !== 'master' && message.role !== 'assistant')) {
      continue
    }
    normalized.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: String(message.text ?? ''),
    })
  }

  if (prompt && (!normalized.length || normalized.at(-1)?.content !== prompt)) {
    normalized.push({ role: 'user', content: prompt })
  }

  return normalized
}

function toGeminiContents(messages = [], prompt = '') {
  return normalizeMessages(messages, prompt).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }))
}

function normalizeDynamicOpenAiModels(provider, payload = {}) {
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : []
  return rows.map((item) => {
    const promptPrice = Number(item?.pricing?.prompt ?? item?.pricing?.input ?? NaN)
    const completionPrice = Number(item?.pricing?.completion ?? item?.pricing?.output ?? NaN)
    const zeroPriced = Number.isFinite(promptPrice) && Number.isFinite(completionPrice) && promptPrice === 0 && completionPrice === 0
    return {
      provider,
      model_id: String(item.id),
      display_name: String(item.name ?? item.id),
      free_candidate: zeroPriced || /:free$/i.test(String(item.id)),
      verified_available: false,
      supports_streaming: true,
      supports_tools: Boolean(item.supports_tools ?? false),
      supports_vision: Boolean(item.supports_vision ?? false),
      quality_score: 70,
      reasoning_score: 70,
      coding_score: 70,
      speed_score: 70,
      stability_score: 70,
      priority: 5,
      excluded: false,
      last_checked_at: null,
      last_error: '',
      notes: '동적 조회로 추가된 후보',
      source: 'dynamic',
    }
  })
}

async function handleOpenAiCompatibleVerify({
  provider,
  baseUrl,
  apiKey,
  modelId,
  fetchWithTimeout,
  requestTimeoutMs,
  extraHeaders = {},
}) {
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: modelId,
      stream: false,
      temperature: 0,
      max_tokens: 12,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  }, requestTimeoutMs)

  if (!response.ok) {
    const payload = await readJsonSafe(response)
    const message = payload?.error?.message ?? payload?.message ?? `호출 실패 (${response.status})`
    throw createProviderError({
      provider,
      type: parseStatusErrorType(response.status, message),
      message,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
    })
  }

  const payload = await response.json()
  return { ok: true, text: extractOpenAiText(payload) }
}

async function handleOpenAiCompatibleStream({
  provider,
  baseUrl,
  apiKey,
  modelId,
  messages,
  prompt,
  systemPrompt,
  fetchWithTimeout,
  requestTimeoutMs,
  firstTokenTimeoutMs,
  onToken,
  onFirstToken,
  extraHeaders = {},
}) {
  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({
      model: modelId,
      stream: true,
      temperature: 0.3,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...normalizeMessages(messages, prompt),
      ],
    }),
  }, requestTimeoutMs)

  if (!response.ok) {
    const payload = await readJsonSafe(response)
    const message = payload?.error?.message ?? payload?.message ?? `호출 실패 (${response.status})`
    throw createProviderError({
      provider,
      type: parseStatusErrorType(response.status, message),
      message,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
    })
  }

  let text = ''
  let firstTokenAt = null
  await readSseStream(response, {
    provider,
    firstTokenTimeoutMs,
    onEvent: async ({ data }) => {
      if (!data || data === '[DONE]') {
        return
      }
      let payload
      try {
        payload = JSON.parse(data)
      } catch {
        return
      }
      const delta = payload?.choices?.[0]?.delta?.content
      const chunk = typeof delta === 'string'
        ? delta
        : Array.isArray(delta)
          ? delta.map((item) => (typeof item?.text === 'string' ? item.text : '')).join('')
          : ''
      if (!chunk) {
        return
      }
      if (!firstTokenAt) {
        firstTokenAt = nowIso()
        onFirstToken?.(firstTokenAt)
      }
      text += chunk
      await onToken(chunk)
    },
  })

  if (!text) {
    throw createProviderError({
      provider,
      type: 'empty',
      message: '스트리밍은 열렸지만 실제 토큰이 오지 않았습니다.',
      retryable: true,
    })
  }

  return { provider, model: modelId, text, firstTokenAt }
}

async function handleGeminiVerify({ apiKey, modelId, fetchWithTimeout, requestTimeoutMs }) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 16 },
    }),
  }, requestTimeoutMs)

  if (!response.ok) {
    const payload = await readJsonSafe(response)
    const message = payload?.error?.message ?? payload?.message ?? `호출 실패 (${response.status})`
    throw createProviderError({
      provider: 'gemini',
      type: parseStatusErrorType(response.status, message),
      message,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
    })
  }

  const payload = await response.json()
  return {
    ok: true,
    text: payload?.candidates?.[0]?.content?.parts?.map((item) => item?.text ?? '').join('') ?? '',
  }
}

async function handleGeminiStream({
  apiKey,
  modelId,
  messages,
  prompt,
  systemPrompt,
  fetchWithTimeout,
  requestTimeoutMs,
  firstTokenTimeoutMs,
  onToken,
  onFirstToken,
}) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
      contents: toGeminiContents(messages, prompt),
      generationConfig: { temperature: 0.3 },
    }),
  }, requestTimeoutMs)

  if (!response.ok) {
    const payload = await readJsonSafe(response)
    const message = payload?.error?.message ?? payload?.message ?? `호출 실패 (${response.status})`
    throw createProviderError({
      provider: 'gemini',
      type: parseStatusErrorType(response.status, message),
      message,
      statusCode: response.status,
      retryable: response.status === 429 || response.status >= 500,
    })
  }

  let text = ''
  let firstTokenAt = null
  await readSseStream(response, {
    provider: 'gemini',
    firstTokenTimeoutMs,
    onEvent: async ({ data }) => {
      if (!data) {
        return
      }
      let payload
      try {
        payload = JSON.parse(data)
      } catch {
        return
      }
      const chunk = payload?.candidates?.[0]?.content?.parts?.map((item) => item?.text ?? '').join('') ?? ''
      if (!chunk) {
        return
      }
      if (!firstTokenAt) {
        firstTokenAt = nowIso()
        onFirstToken?.(firstTokenAt)
      }
      text += chunk
      await onToken(chunk)
    },
  })

  if (!text) {
    throw createProviderError({
      provider: 'gemini',
      type: 'empty',
      message: 'Gemini 스트리밍은 연결됐지만 실제 토큰이 오지 않았습니다.',
      retryable: true,
    })
  }

  return { provider: 'gemini', model: modelId, text, firstTokenAt }
}

function normalizeGeminiModels(payload = {}) {
  const rows = Array.isArray(payload.models) ? payload.models : []
  return rows
    .filter(
      (item) =>
        Array.isArray(item.supportedGenerationMethods) &&
        item.supportedGenerationMethods.includes('generateContent'),
    )
    .map((item) => ({
      provider: 'gemini',
      model_id: String(item.name).replace(/^models\//, ''),
      display_name: String(item.displayName ?? item.name).replace(/^models\//, ''),
      free_candidate: false,
      verified_available: false,
      supports_streaming: true,
      supports_tools: true,
      supports_vision: /vision|image/i.test(String(item.name)),
      quality_score: 72,
      reasoning_score: 72,
      coding_score: 70,
      speed_score: 78,
      stability_score: 82,
      priority: 4,
      excluded: false,
      last_checked_at: null,
      last_error: '',
      notes: '동적 조회로 추가된 Gemini 모델',
      source: 'dynamic',
    }))
}

export function createProviderAdapters({ fetchWithTimeout, requestTimeoutMs, firstTokenTimeoutMs }) {
  return {
    openrouter: {
      provider: 'openrouter',
      label: getProviderLabel('openrouter'),
      async listDynamicModels({ apiKey }) {
        const response = await fetchWithTimeout('https://openrouter.ai/api/v1/models', {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        }, requestTimeoutMs)
        if (!response.ok) {
          const payload = await readJsonSafe(response)
          const message = payload?.error?.message ?? payload?.message ?? `모델 조회 실패 (${response.status})`
          throw createProviderError({
            provider: 'openrouter',
            type: parseStatusErrorType(response.status, message),
            message,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429,
          })
        }
        return normalizeDynamicOpenAiModels('openrouter', await response.json())
      },
      verifyModelAvailability({ apiKey, modelId, appTitle, httpReferer }) {
        return handleOpenAiCompatibleVerify({
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey,
          modelId,
          fetchWithTimeout,
          requestTimeoutMs,
          extraHeaders: {
            ...(appTitle ? { 'X-Title': appTitle } : {}),
            ...(httpReferer ? { 'HTTP-Referer': httpReferer } : {}),
          },
        })
      },
      testConnection({ apiKey, modelId, appTitle, httpReferer }) {
        return this.verifyModelAvailability({ apiKey, modelId, appTitle, httpReferer })
      },
      streamChat({ apiKey, modelId, appTitle, httpReferer, messages, prompt, systemPrompt, onToken, onFirstToken }) {
        return handleOpenAiCompatibleStream({
          provider: 'openrouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          apiKey,
          modelId,
          messages,
          prompt,
          systemPrompt,
          fetchWithTimeout,
          requestTimeoutMs,
          firstTokenTimeoutMs,
          onToken,
          onFirstToken,
          extraHeaders: {
            ...(appTitle ? { 'X-Title': appTitle } : {}),
            ...(httpReferer ? { 'HTTP-Referer': httpReferer } : {}),
          },
        })
      },
    },
    'nvidia-build': {
      provider: 'nvidia-build',
      label: getProviderLabel('nvidia-build'),
      async listDynamicModels({ apiKey }) {
        const response = await fetchWithTimeout('https://integrate.api.nvidia.com/v1/models', {
          headers: { Authorization: `Bearer ${apiKey}` },
        }, requestTimeoutMs)
        if (!response.ok) {
          const payload = await readJsonSafe(response)
          const message = payload?.error?.message ?? payload?.message ?? `모델 조회 실패 (${response.status})`
          throw createProviderError({
            provider: 'nvidia-build',
            type: parseStatusErrorType(response.status, message),
            message,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429,
          })
        }
        return normalizeDynamicOpenAiModels('nvidia-build', await response.json())
      },
      verifyModelAvailability({ apiKey, modelId }) {
        return handleOpenAiCompatibleVerify({
          provider: 'nvidia-build',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          apiKey,
          modelId,
          fetchWithTimeout,
          requestTimeoutMs,
        })
      },
      testConnection({ apiKey, modelId }) {
        return this.verifyModelAvailability({ apiKey, modelId })
      },
      streamChat({ apiKey, modelId, messages, prompt, systemPrompt, onToken, onFirstToken }) {
        return handleOpenAiCompatibleStream({
          provider: 'nvidia-build',
          baseUrl: 'https://integrate.api.nvidia.com/v1',
          apiKey,
          modelId,
          messages,
          prompt,
          systemPrompt,
          fetchWithTimeout,
          requestTimeoutMs,
          firstTokenTimeoutMs,
          onToken,
          onFirstToken,
        })
      },
    },
    gemini: {
      provider: 'gemini',
      label: getProviderLabel('gemini'),
      async listDynamicModels({ apiKey }) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
        const response = await fetchWithTimeout(endpoint, {}, requestTimeoutMs)
        if (!response.ok) {
          const payload = await readJsonSafe(response)
          const message = payload?.error?.message ?? payload?.message ?? `모델 조회 실패 (${response.status})`
          throw createProviderError({
            provider: 'gemini',
            type: parseStatusErrorType(response.status, message),
            message,
            statusCode: response.status,
            retryable: response.status >= 500 || response.status === 429,
          })
        }
        return normalizeGeminiModels(await response.json())
      },
      verifyModelAvailability({ apiKey, modelId }) {
        return handleGeminiVerify({ apiKey, modelId, fetchWithTimeout, requestTimeoutMs })
      },
      testConnection({ apiKey, modelId }) {
        return this.verifyModelAvailability({ apiKey, modelId })
      },
      streamChat({ apiKey, modelId, messages, prompt, systemPrompt, onToken, onFirstToken }) {
        return handleGeminiStream({
          apiKey,
          modelId,
          messages,
          prompt,
          systemPrompt,
          fetchWithTimeout,
          requestTimeoutMs,
          firstTokenTimeoutMs,
          onToken,
          onFirstToken,
        })
      },
    },
  }
}

export function normalizeProviderError(provider, error) {
  const normalizedProvider = normalizeProviderId(provider)
  if (error?.provider === normalizedProvider && error?.type) {
    return {
      provider: normalizedProvider,
      type: error.type,
      message: error.message ?? '공급자 호출 중 오류가 발생했습니다.',
      statusCode: error.statusCode ?? null,
      retryable: Boolean(error.retryable),
    }
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      provider: normalizedProvider,
      type: 'timeout',
      message: '응답 대기 시간이 초과되었습니다.',
      statusCode: null,
      retryable: true,
    }
  }

  const message = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
  return {
    provider: normalizedProvider,
    type: /network|fetch/i.test(message) ? 'network' : 'unknown',
    message,
    statusCode: error?.statusCode ?? null,
    retryable: true,
  }
}
