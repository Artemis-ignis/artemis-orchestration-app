import { nowIso, parseBooleanFlag } from '../../auto-posts/normalize.mjs'

const X_POST_ENDPOINT = 'https://api.x.com/2/tweets'
const X_TOKEN_ENDPOINT = 'https://api.x.com/2/oauth2/token'

function buildStatus(detail, overrides = {}) {
  return {
    target: 'x',
    enabled: parseBooleanFlag(process.env.PUBLISH_X_ENABLED, false),
    configured: false,
    ready: false,
    detail,
    ...overrides,
  }
}

function getCredentials() {
  return {
    enabled: parseBooleanFlag(process.env.PUBLISH_X_ENABLED, false),
    clientId: String(process.env.X_CLIENT_ID ?? '').trim(),
    clientSecret: String(process.env.X_CLIENT_SECRET ?? '').trim(),
    accessToken: String(process.env.X_ACCESS_TOKEN ?? '').trim(),
    refreshToken: String(process.env.X_REFRESH_TOKEN ?? '').trim(),
    bearerToken: String(process.env.X_BEARER_TOKEN ?? '').trim(),
  }
}

export function createOptionalXPublisher({ fetchWithTimeout }) {
  let cachedAccessToken = ''

  async function refreshAccessToken(credentials) {
    if (!credentials.refreshToken || !credentials.clientId) {
      return ''
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: credentials.clientId,
    })

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    if (credentials.clientSecret) {
      const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`, 'utf8').toString('base64')
      headers.Authorization = `Basic ${basic}`
    }

    const response = await fetchWithTimeout(
      X_TOKEN_ENDPOINT,
      {
        method: 'POST',
        headers,
        body: body.toString(),
      },
      15_000,
    )

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || `X OAuth token refresh failed (${response.status})`)
    }

    const payload = await response.json()
    cachedAccessToken = String(payload.access_token ?? '').trim()
    return cachedAccessToken
  }

  async function resolveAccessToken() {
    const credentials = getCredentials()
    if (!credentials.enabled) {
      return ''
    }

    if (credentials.accessToken) {
      return credentials.accessToken
    }

    if (cachedAccessToken) {
      return cachedAccessToken
    }

    if (credentials.refreshToken) {
      return refreshAccessToken(credentials)
    }

    return ''
  }

  async function getStatus() {
    const credentials = getCredentials()
    if (!credentials.enabled) {
      return buildStatus('X cross-post publisher가 비활성화되어 있습니다.')
    }

    if (credentials.accessToken || cachedAccessToken) {
      return buildStatus('X access token이 연결되어 있습니다.', {
        enabled: true,
        configured: true,
        ready: true,
        authMode: 'user-access-token',
      })
    }

    if (credentials.refreshToken && credentials.clientId) {
      return buildStatus('X refresh token으로 게시 토큰을 갱신할 수 있습니다.', {
        enabled: true,
        configured: true,
        ready: true,
        authMode: 'oauth2-refresh',
      })
    }

    if (credentials.bearerToken) {
      return buildStatus('bearer token만 있어 실제 게시 대신 disabled 상태로 유지합니다.', {
        enabled: true,
        configured: true,
        ready: false,
        authMode: 'bearer-only',
      })
    }

    return buildStatus('X 인증 정보가 없어 cross-post는 비활성 상태입니다.', {
      enabled: true,
      configured: false,
      ready: false,
      authMode: 'missing',
    })
  }

  async function publish({ text, dryRun = false }) {
    const status = await getStatus()
    const startedAt = nowIso()

    if (!status.enabled || !status.ready || dryRun) {
      return {
        ok: false,
        simulated: true,
        disabled: !status.enabled || !status.ready,
        xPostId: null,
        postedAt: null,
        detail: dryRun
          ? 'dry-run 모드에서는 X cross-post를 실행하지 않습니다.'
          : status.detail,
      }
    }

    const accessToken = await resolveAccessToken()
    if (!accessToken) {
      return {
        ok: false,
        simulated: true,
        disabled: true,
        xPostId: null,
        postedAt: null,
        detail: '실제 게시 토큰을 얻지 못해 X cross-post를 건너뜁니다.',
      }
    }

    const response = await fetchWithTimeout(
      X_POST_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      },
      15_000,
    )

    const payloadText = await response.text()
    let payload = null
    try {
      payload = payloadText ? JSON.parse(payloadText) : null
    } catch {
      payload = null
    }

    if (!response.ok) {
      return {
        ok: false,
        simulated: false,
        disabled: false,
        xPostId: null,
        postedAt: null,
        error: {
          status: response.status,
          message:
            payload?.detail ||
            payload?.title ||
            payload?.error ||
            payloadText ||
            `X post request failed (${response.status})`,
          payload,
        },
      }
    }

    return {
      ok: true,
      simulated: false,
      disabled: false,
      xPostId: String(payload?.data?.id ?? ''),
      postedAt: startedAt,
      detail: '공식 X API로 cross-post를 완료했습니다.',
      payload,
    }
  }

  return {
    getStatus,
    publish,
  }
}
