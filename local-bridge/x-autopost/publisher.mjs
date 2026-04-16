import { nowIso, parseBooleanFlag } from '../auto-posts/normalize.mjs'

const X_POST_ENDPOINT = 'https://api.x.com/2/tweets'
const X_TOKEN_ENDPOINT = 'https://api.x.com/2/oauth2/token'

function buildAuthStatus(detail, overrides = {}) {
  return {
    enabled: parseBooleanFlag(process.env.X_API_ENABLED, false),
    configured: false,
    ready: false,
    detail,
    ...overrides,
  }
}

function getCredentials() {
  return {
    enabled: parseBooleanFlag(process.env.X_API_ENABLED, false),
    clientId: String(process.env.X_CLIENT_ID ?? '').trim(),
    clientSecret: String(process.env.X_CLIENT_SECRET ?? '').trim(),
    accessToken: String(process.env.X_ACCESS_TOKEN ?? '').trim(),
    refreshToken: String(process.env.X_REFRESH_TOKEN ?? '').trim(),
    bearerToken: String(process.env.X_BEARER_TOKEN ?? '').trim(),
  }
}

export function createXPublisher({ fetchWithTimeout }) {
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
      throw new Error(message || `X OAuth 갱신이 실패했습니다. (${response.status})`)
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

    return credentials.bearerToken
  }

  async function getStatus() {
    const credentials = getCredentials()
    if (!credentials.enabled) {
      return buildAuthStatus('X publisher가 비활성화되어 있습니다.')
    }

    if (credentials.accessToken || cachedAccessToken) {
      return buildAuthStatus('X access token이 연결되어 있습니다.', {
        configured: true,
        ready: true,
        authMode: 'user-access-token',
      })
    }

    if (credentials.refreshToken && credentials.clientId) {
      return buildAuthStatus('X refresh token으로 게시 토큰을 갱신할 수 있습니다.', {
        configured: true,
        ready: true,
        authMode: 'oauth2-refresh',
      })
    }

    if (credentials.bearerToken) {
      return buildAuthStatus('bearer token만 있어 실제 게시 대신 dry-run fallback이 필요합니다.', {
        configured: true,
        ready: false,
        authMode: 'bearer-only',
      })
    }

    return buildAuthStatus('X 인증 정보가 부족해 dry-run fallback만 가능합니다.', {
      configured: false,
      ready: false,
      authMode: 'missing',
    })
  }

  async function publish({ text, dryRun = false }) {
    const status = await getStatus()
    const startedAt = nowIso()

    if (dryRun || !status.ready) {
      return {
        ok: true,
        simulated: true,
        xPostId: `dryrun-${Date.now().toString(36)}`,
        postedAt: startedAt,
        detail: status.ready ? 'dry-run 모드로 게시를 시뮬레이션했습니다.' : 'X 인증이 없어 dry-run fallback으로 처리했습니다.',
      }
    }

    const accessToken = await resolveAccessToken()
    if (!accessToken) {
      return {
        ok: true,
        simulated: true,
        xPostId: `dryrun-${Date.now().toString(36)}`,
        postedAt: startedAt,
        detail: '실제 게시 토큰을 확보하지 못해 dry-run fallback으로 처리했습니다.',
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
        postedAt: null,
        xPostId: null,
        error: {
          status: response.status,
          message:
            payload?.detail ||
            payload?.title ||
            payload?.error ||
            payloadText ||
            `X 게시 요청이 실패했습니다. (${response.status})`,
          payload,
        },
      }
    }

    return {
      ok: true,
      simulated: false,
      xPostId: String(payload?.data?.id ?? ''),
      postedAt: startedAt,
      detail: '공식 X API로 게시했습니다.',
      payload,
    }
  }

  return {
    getStatus,
    publish,
  }
}
