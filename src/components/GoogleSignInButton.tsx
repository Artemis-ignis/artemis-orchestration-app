import { useEffect, useRef, useState } from 'react'
import { getGoogleClientId, hasGoogleClientId, loadGoogleIdentity } from '../lib/googleIdentity'

export function GoogleSignInButton({
  onCredential,
  onError,
  disabled = false,
}: {
  onCredential: (credential: string) => void
  onError: (message: string) => void
  disabled?: boolean
}) {
  const buttonRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (disabled || !buttonRef.current) {
      return
    }

    let active = true

    const render = async () => {
      if (!hasGoogleClientId()) {
        onError('Google OAuth 클라이언트 ID가 아직 연결되지 않았습니다.')
        return
      }

      try {
        const google = await loadGoogleIdentity()

        if (!active || !google || !buttonRef.current) {
          return
        }

        buttonRef.current.innerHTML = ''
        google.accounts.id.initialize({
          client_id: getGoogleClientId(),
          callback: (response) => {
            if (!response.credential) {
              onError('Google 로그인 응답을 받지 못했습니다.')
              return
            }

            onCredential(response.credential)
          },
          ux_mode: 'popup',
          auto_select: false,
          context: 'signup',
        })
        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'left',
          width: Math.max(buttonRef.current.clientWidth, 280),
        })
        setReady(true)
      } catch (error) {
        if (!active) {
          return
        }

        onError(error instanceof Error ? error.message : 'Google 로그인 버튼을 준비하지 못했습니다.')
      }
    }

    void render()

    return () => {
      active = false
    }
  }, [disabled, onCredential, onError])

  return (
    <div className="google-authBlock">
      <div className="google-authBlock__button" ref={buttonRef} />
      {!ready ? <p className="google-authBlock__hint">Google 로그인 버튼을 준비하는 중입니다.</p> : null}
    </div>
  )
}

export default GoogleSignInButton
