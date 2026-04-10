import type { CSSProperties } from 'react'

export type IconName =
  | 'chat'
  | 'messenger'
  | 'files'
  | 'insights'
  | 'signals'
  | 'mail'
  | 'tools'
  | 'agent'
  | 'marketplace'
  | 'activity'
  | 'billing'
  | 'settings'
  | 'guide'
  | 'news'
  | 'search'
  | 'plus'
  | 'chevron-left'
  | 'chevron-down'
  | 'spark'
  | 'paperclip'
  | 'image'
  | 'mic'
  | 'car'
  | 'send'
  | 'desktop'
  | 'book'
  | 'folder'
  | 'trash'
  | 'lock'
  | 'copy'
  | 'external'
  | 'calendar'
  | 'globe'
  | 'mail-open'
  | 'download'
  | 'user'
  | 'memory'
  | 'warning'
  | 'check'

export function Icon({
  name,
  size = 20,
  className,
  style,
}: {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  }

  const paths = (() => {
    switch (name) {
      case 'chat':
        return (
          <>
            <path d="M5 15.5a6.5 6.5 0 1 1 2.1 4.8L3.5 21l1.2-3.5" {...common} />
          </>
        )
      case 'messenger':
        return (
          <>
            <path d="M4 11a7 7 0 1 1 4.1 6.4L4 19l1.2-3.3" {...common} />
            <path d="m8 11 2.6 2.3L16 9.2" {...common} />
          </>
        )
      case 'files':
        return (
          <>
            <path d="M3.5 7.5h6l1.6-2h5.4a1.5 1.5 0 0 1 1.5 1.5v9A2 2 0 0 1 16 18H5a2 2 0 0 1-2-2z" {...common} />
          </>
        )
      case 'insights':
        return (
          <>
            <path d="m12 3-3 6h4l-1 5 4-7h-4z" {...common} />
          </>
        )
      case 'signals':
        return (
          <>
            <path d="M12 12a1.5 1.5 0 1 0 0 .01" {...common} />
            <path d="M6.8 6.8a7.4 7.4 0 0 0 0 10.4" {...common} />
            <path d="M17.2 6.8a7.4 7.4 0 0 1 0 10.4" {...common} />
            <path d="M4 4a11.3 11.3 0 0 0 0 16" {...common} />
            <path d="M20 4a11.3 11.3 0 0 1 0 16" {...common} />
          </>
        )
      case 'mail':
        return (
          <>
            <rect x="3.5" y="5.5" width="17" height="13" rx="2" {...common} />
            <path d="m5 7 7 5 7-5" {...common} />
          </>
        )
      case 'tools':
        return (
          <>
            <path d="m14 6 4 4-3 3-4-4" {...common} />
            <path d="m5 19 6.5-6.5" {...common} />
            <path d="M8 8 5 5 3 7l3 3" {...common} />
          </>
        )
      case 'agent':
        return (
          <>
            <rect x="6.5" y="8" width="11" height="8.5" rx="3" {...common} />
            <path d="M12 3.5v3M9 19h6M10 8V6.5a2 2 0 0 1 4 0V8" {...common} />
            <circle cx="10" cy="12" r="1" fill="currentColor" />
            <circle cx="14" cy="12" r="1" fill="currentColor" />
            <path d="M10 14.5c.7.7 1.4 1 2 1s1.3-.3 2-1" {...common} />
          </>
        )
      case 'marketplace':
        return (
          <>
            <path d="M4 8h16l-1.3 10.2A2 2 0 0 1 16.7 20H7.3a2 2 0 0 1-2-1.8z" {...common} />
            <path d="M8 8a4 4 0 0 1 8 0" {...common} />
          </>
        )
      case 'activity':
        return (
          <>
            <rect x="4" y="3.5" width="16" height="17" rx="2" {...common} />
            <path d="M8 7.5h8M8 12h8M8 16.5h5" {...common} />
          </>
        )
      case 'billing':
        return (
          <>
            <path d="M5 7.5h14v9H5z" {...common} />
            <path d="M8.5 12h7" {...common} />
          </>
        )
      case 'settings':
        return (
          <>
            <circle cx="12" cy="12" r="3.2" {...common} />
            <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4.8a7.7 7.7 0 0 0-1.7-1L14.4 3h-4.8L9.2 5.8c-.6.3-1.2.7-1.7 1l-2.4-.8-2 3.5 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-.8c.5.4 1.1.8 1.7 1l.4 2.8h4.8l.4-2.8c.6-.3 1.2-.7 1.7-1l2.4.8 2-3.5-2-1.5c.1-.3.1-.7.1-1z" {...common} />
          </>
        )
      case 'guide':
        return (
          <>
            <path d="M5 5.5h6.2a2.3 2.3 0 0 1 1.8.8 2.3 2.3 0 0 1 1.8-.8H19v13h-4.2A2.3 2.3 0 0 0 13 19a2.3 2.3 0 0 0-1.8-.5H5z" {...common} />
          </>
        )
      case 'news':
        return (
          <>
            <path d="M4 6h11a2 2 0 0 1 2 2v8H6a2 2 0 0 0-2 2z" {...common} />
            <path d="M17 8h3v9a2 2 0 0 1-2 2H6" {...common} />
          </>
        )
      case 'search':
        return (
          <>
            <circle cx="11" cy="11" r="6.5" {...common} />
            <path d="m16 16 4 4" {...common} />
          </>
        )
      case 'plus':
        return <path d="M12 5v14M5 12h14" {...common} />
      case 'chevron-left':
        return <path d="m14.5 5.5-6 6 6 6" {...common} />
      case 'chevron-down':
        return <path d="m6 9 6 6 6-6" {...common} />
      case 'spark':
        return (
          <>
            <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" {...common} />
          </>
        )
      case 'paperclip':
        return <path d="M8.5 12.5 14 7a3 3 0 1 1 4.2 4.2l-7.4 7.4a5 5 0 0 1-7-7L11 4.4" {...common} />
      case 'image':
        return (
          <>
            <rect x="3.5" y="5" width="17" height="14" rx="2" {...common} />
            <circle cx="9" cy="10" r="1.5" {...common} />
            <path d="m6 17 4.5-4.5 2.8 2.8 2-2L18 17" {...common} />
          </>
        )
      case 'mic':
        return (
          <>
            <rect x="9" y="4" width="6" height="10" rx="3" {...common} />
            <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" {...common} />
          </>
        )
      case 'car':
        return (
          <>
            <path d="m5 14 1.5-4.5A2 2 0 0 1 8.4 8h7.2a2 2 0 0 1 1.9 1.5L19 14" {...common} />
            <path d="M4 14h16v3.5a1 1 0 0 1-1 1h-1v-1.5H6v1.5H5a1 1 0 0 1-1-1z" {...common} />
            <circle cx="7.5" cy="15.5" r="1" fill="currentColor" />
            <circle cx="16.5" cy="15.5" r="1" fill="currentColor" />
          </>
        )
      case 'send':
        return <path d="m4 12 15-8-3 16-4.5-6.5zM11.5 13.5 19 4" {...common} />
      case 'desktop':
        return (
          <>
            <rect x="4" y="5" width="16" height="11" rx="2" {...common} />
            <path d="M9 20h6M12 16v4" {...common} />
          </>
        )
      case 'book':
        return (
          <>
            <path d="M5 5.5h5.8A2.2 2.2 0 0 1 13 6.6V19a2.2 2.2 0 0 0-2.2-1.1H5z" {...common} />
            <path d="M19 5.5h-5.8A2.2 2.2 0 0 0 11 6.6V19a2.2 2.2 0 0 1 2.2-1.1H19z" {...common} />
          </>
        )
      case 'folder':
        return <path d="M3.5 8.5h6l1.6-2h5.4a1.5 1.5 0 0 1 1.5 1.5v8A2.5 2.5 0 0 1 15.5 18h-9A2.5 2.5 0 0 1 4 15.5z" {...common} />
      case 'trash':
        return (
          <>
            <path d="M5 7h14M9 7V5h6v2M8 7l.8 11h6.4L16 7" {...common} />
          </>
        )
      case 'lock':
        return (
          <>
            <rect x="5" y="10" width="14" height="10" rx="2" {...common} />
            <path d="M8 10V7.5a4 4 0 1 1 8 0V10" {...common} />
          </>
        )
      case 'copy':
        return (
          <>
            <rect x="8" y="8" width="11" height="11" rx="2" {...common} />
            <path d="M5 15V6a2 2 0 0 1 2-2h9" {...common} />
          </>
        )
      case 'external':
        return (
          <>
            <path d="M10 14 19 5" {...common} />
            <path d="M13 5h6v6" {...common} />
            <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" {...common} />
          </>
        )
      case 'calendar':
        return (
          <>
            <rect x="4" y="5.5" width="16" height="14" rx="2" {...common} />
            <path d="M8 3.5v4M16 3.5v4M4 9.5h16" {...common} />
          </>
        )
      case 'globe':
        return (
          <>
            <circle cx="12" cy="12" r="8" {...common} />
            <path d="M4.5 12h15M12 4a13 13 0 0 1 0 16M12 4a13 13 0 0 0 0 16" {...common} />
          </>
        )
      case 'mail-open':
        return (
          <>
            <path d="M3.5 10.5 12 4l8.5 6.5V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" {...common} />
            <path d="m6 11 6 4 6-4" {...common} />
          </>
        )
      case 'download':
        return (
          <>
            <path d="M12 4v10M8 10l4 4 4-4M5 19h14" {...common} />
          </>
        )
      case 'user':
        return (
          <>
            <circle cx="12" cy="8" r="3.2" {...common} />
            <path d="M5 19a7 7 0 0 1 14 0" {...common} />
          </>
        )
      case 'memory':
        return (
          <>
            <path d="M8 5v2M12 5v2M16 5v2M8 17v2M12 17v2M16 17v2M5 8h2M5 12h2M5 16h2M17 8h2M17 12h2M17 16h2" {...common} />
            <rect x="7.5" y="7.5" width="9" height="9" rx="2" {...common} />
          </>
        )
      case 'warning':
        return (
          <>
            <path d="m12 4 8 15H4z" {...common} />
            <path d="M12 9.5v4M12 16h.01" {...common} />
          </>
        )
      case 'check':
        return <path d="m5.5 12.5 4 4 9-9" {...common} />
      default:
        return null
    }
  })()

  return (
    <svg
      aria-hidden="true"
      className={className}
      style={style}
      viewBox="0 0 24 24"
      width={size}
      height={size}
    >
      {paths}
    </svg>
  )
}

export function CrewBot({
  size = 132,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 160 160"
      width={size}
      height={size}
    >
      <defs>
        <radialGradient id="artemisAura" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="#3a3127" />
          <stop offset="100%" stopColor="#15110e" />
        </radialGradient>
        <linearGradient id="artemisMoon" x1="36" x2="104" y1="28" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f3e7c3" />
          <stop offset="100%" stopColor="#c8a76b" />
        </linearGradient>
        <linearGradient id="artemisNight" x1="58" x2="102" y1="54" y2="104" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1c2730" />
          <stop offset="100%" stopColor="#0e151c" />
        </linearGradient>
      </defs>

      <circle cx="80" cy="80" r="56" fill="url(#artemisAura)" />
      <circle cx="80" cy="80" r="55" fill="none" stroke="rgba(240,223,178,0.14)" strokeWidth="2" />
      <path
        d="M38 84c10 22 27 34 42 34s32-12 42-34"
        fill="none"
        stroke="rgba(240,223,178,0.3)"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <path
        d="M51 57c9-15 20-22 29-22s20 7 29 22"
        fill="none"
        stroke="rgba(240,223,178,0.22)"
        strokeLinecap="round"
        strokeWidth="3"
      />

      <circle cx="80" cy="78" r="28" fill="url(#artemisNight)" />
      <circle cx="72" cy="78" r="18" fill="url(#artemisMoon)" />
      <circle cx="81" cy="76" r="18" fill="url(#artemisNight)" />

      <circle cx="115" cy="47" r="3.5" fill="#f0dfb2" />
      <circle cx="49" cy="50" r="2.8" fill="#d7bd86" opacity="0.84" />
      <circle cx="106" cy="103" r="2.2" fill="#f0dfb2" opacity="0.8" />
      <circle cx="56" cy="104" r="2.2" fill="#d7bd86" opacity="0.72" />
      <path
        d="M110 63c1.7.3 3 1.6 3.3 3.3.1.4.6.4.7 0 .3-1.7 1.6-3 3.3-3.3.4-.1.4-.6 0-.7-1.7-.3-3-1.6-3.3-3.3-.1-.4-.6-.4-.7 0-.3 1.7-1.6 3-3.3 3.3-.4.1-.4.6 0 .7Z"
        fill="#f0dfb2"
      />
      <path
        d="M75 21c1.9 0 3.5 1.6 3.5 3.5V31a1.5 1.5 0 0 0 3 0v-6.5c0-1.9 1.6-3.5 3.5-3.5"
        fill="none"
        stroke="#d7bd86"
        strokeLinecap="round"
        strokeWidth="3"
      />
    </svg>
  )
}
