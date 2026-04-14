export type PublicPlanIntent = 'free' | 'plus' | 'pro'
export type PublicAccountStatus = 'guest' | 'lead' | 'trial' | 'active' | 'cancelled'
export type PublicBillingState = 'none' | 'pending' | 'trial' | 'active' | 'cancelled'
export type PublicAuthProvider = 'none' | 'google'

export type PublicProfile = {
  name: string
  email: string
  teamSize: string
  role: string
  useCase: string
  planIntent: PublicPlanIntent
  accountId: string
  activePlan: PublicPlanIntent
  accountStatus: PublicAccountStatus
  billingState: PublicBillingState
  authProvider: PublicAuthProvider
  googleSub: string
  avatarUrl: string
  isAuthenticated: boolean
  authenticatedAt: string
  updatedAt: string
}

const STORAGE_KEY = 'artemis-public-profile/v2'

const defaultProfile: PublicProfile = {
  name: '',
  email: '',
  teamSize: '',
  role: '',
  useCase: '',
  planIntent: 'free',
  accountId: '',
  activePlan: 'free',
  accountStatus: 'guest',
  billingState: 'none',
  authProvider: 'none',
  googleSub: '',
  avatarUrl: '',
  isAuthenticated: false,
  authenticatedAt: '',
  updatedAt: '',
}

export function loadPublicProfile(): PublicProfile {
  if (typeof window === 'undefined') {
    return defaultProfile
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return defaultProfile
    }

    const parsed = JSON.parse(raw) as Partial<PublicProfile>
    return {
      ...defaultProfile,
      ...parsed,
    }
  } catch {
    return defaultProfile
  }
}

export function savePublicProfile(profile: Partial<PublicProfile>) {
  if (typeof window === 'undefined') {
    return
  }

  const current = loadPublicProfile()
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      ...current,
      ...profile,
      updatedAt: new Date().toISOString(),
    }),
  )
}

export function setPublicPlanIntent(planIntent: PublicPlanIntent) {
  savePublicProfile({ planIntent })
}

export function applyPublicAccountSnapshot(snapshot: Partial<PublicProfile>) {
  savePublicProfile({
    accountId: snapshot.accountId ?? '',
    name: snapshot.name ?? '',
    email: snapshot.email ?? '',
    teamSize: snapshot.teamSize ?? '',
    role: snapshot.role ?? '',
    useCase: snapshot.useCase ?? '',
    planIntent: snapshot.planIntent ?? 'free',
    activePlan: snapshot.activePlan ?? snapshot.planIntent ?? 'free',
    accountStatus: snapshot.accountStatus ?? 'guest',
    billingState: snapshot.billingState ?? 'none',
    authProvider: snapshot.authProvider ?? 'none',
    googleSub: snapshot.googleSub ?? '',
    avatarUrl: snapshot.avatarUrl ?? '',
    isAuthenticated: snapshot.isAuthenticated ?? false,
    authenticatedAt: snapshot.authenticatedAt ?? '',
  })
}

export function clearPublicProfileAuth() {
  savePublicProfile({
    authProvider: 'none',
    googleSub: '',
    avatarUrl: '',
    isAuthenticated: false,
    authenticatedAt: '',
    accountId: '',
    activePlan: 'free',
    accountStatus: 'guest',
    billingState: 'none',
  })
}

export function resetPublicProfile() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(STORAGE_KEY)
}
