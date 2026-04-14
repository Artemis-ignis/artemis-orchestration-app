import type {
  PublicAccountStatus,
  PublicBillingState,
  PublicPlanIntent,
} from './publicProfile'

export type PublicAccountSnapshot = {
  accountId: string
  name: string
  email: string
  teamSize: string
  role: string
  useCase: string
  selectedPlan: PublicPlanIntent
  activePlan: PublicPlanIntent
  accountStatus: PublicAccountStatus
  billingState: PublicBillingState
  authProvider: 'none' | 'google'
  googleSub: string
  avatarUrl: string
  emailVerified: boolean
  inquiryCount: number
  lastInquiryId: string
  updatedAt: string
}

export type PublicAuthResponse = {
  account: PublicAccountSnapshot
  authenticatedAt: string
}

type PublicAccountPayload = {
  name?: string
  email?: string
  teamSize?: string
  role?: string
  useCase?: string
  planIntent?: PublicPlanIntent
}

type PublicGoogleAuthPayload = {
  credential: string
  teamSize?: string
  role?: string
  useCase?: string
  planIntent?: PublicPlanIntent
}

async function readResponse<T>(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    account?: T
  }

  if (!response.ok || !data.ok || !data.account) {
    throw new Error(data.error || '계정 상태를 불러오지 못했습니다.')
  }

  return data.account
}

async function readAuthResponse(response: Response) {
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    account?: PublicAccountSnapshot
    authenticatedAt?: string
  }

  if (!response.ok || !data.ok || !data.account || !data.authenticatedAt) {
    throw new Error(data.error || 'Google 로그인을 완료하지 못했습니다.')
  }

  return {
    account: data.account,
    authenticatedAt: data.authenticatedAt,
  } satisfies PublicAuthResponse
}

export async function fetchPublicSessionAccount(bridgeUrl: string) {
  const response = await fetch(`${bridgeUrl}/api/public/account/session`, {
    credentials: 'include',
  })

  return readResponse<PublicAccountSnapshot>(response)
}

export async function startPublicAccount(bridgeUrl: string, payload: PublicAccountPayload) {
  const response = await fetch(`${bridgeUrl}/api/public/account/start`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readResponse<PublicAccountSnapshot>(response)
}

export async function activatePublicAccount(bridgeUrl: string, payload: PublicAccountPayload) {
  const response = await fetch(`${bridgeUrl}/api/public/account/activate`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readResponse<PublicAccountSnapshot>(response)
}

export async function signInWithGoogle(
  bridgeUrl: string,
  payload: PublicGoogleAuthPayload,
) {
  const response = await fetch(`${bridgeUrl}/api/public/auth/google`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  return readAuthResponse(response)
}

export async function signOutPublicSession(bridgeUrl: string) {
  const response = await fetch(`${bridgeUrl}/api/public/auth/signout`, {
    method: 'POST',
    credentials: 'include',
  })

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || '로그아웃을 완료하지 못했습니다.')
  }
}
