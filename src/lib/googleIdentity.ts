const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client'
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() || ''

let googleScriptPromise: Promise<typeof window.google | null> | null = null

function appendGoogleIdentityScript() {
  return new Promise<typeof window.google | null>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT}"]`,
    )

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google ?? null), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.')), {
        once: true,
      })

      if (window.google) {
        resolve(window.google)
      }
      return
    }

    const script = document.createElement('script')
    script.src = GOOGLE_IDENTITY_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google ?? null)
    script.onerror = () => reject(new Error('Google 로그인 스크립트를 불러오지 못했습니다.'))
    document.head.appendChild(script)
  })
}

export function getGoogleClientId() {
  return GOOGLE_CLIENT_ID
}

export function hasGoogleClientId() {
  return GOOGLE_CLIENT_ID.length > 0
}

export async function loadGoogleIdentity() {
  if (typeof window === 'undefined') {
    return null
  }

  if (window.google) {
    return window.google
  }

  if (!googleScriptPromise) {
    googleScriptPromise = appendGoogleIdentityScript()
  }

  return googleScriptPromise
}

export function resetGoogleAutoSelect() {
  window.google?.accounts.id.disableAutoSelect()
}
