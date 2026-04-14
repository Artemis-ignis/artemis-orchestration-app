declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string; select_by?: string }) => void
            ux_mode?: 'popup' | 'redirect'
            auto_select?: boolean
            context?: 'signin' | 'signup' | 'use'
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              text?:
                | 'signin_with'
                | 'signup_with'
                | 'continue_with'
                | 'signin'
              shape?: 'rectangular' | 'pill' | 'circle' | 'square'
              logo_alignment?: 'left' | 'center'
              width?: number
            },
          ) => void
          disableAutoSelect: () => void
          revoke: (hint: string, done: () => void) => void
        }
      }
    }
  }
}

export {}
