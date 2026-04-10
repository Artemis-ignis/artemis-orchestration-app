import { useEffect, useState, useTransition } from 'react'
import './App.css'
import { CrewPage } from './CrewPages'
import { navigationItems, type PageId, type VisiblePageId } from './crewData'
import { Icon } from './icons'
import { useArtemisApp } from './state/context'

const visiblePages = new Set<VisiblePageId>([
  'chat',
  'files',
  'insights',
  'signals',
  'tools',
  'agents',
  'activity',
  'settings',
])

const legacyRedirects: Record<string, VisiblePageId> = {
  channels: 'chat',
  mail: 'chat',
  marketplace: 'tools',
  billing: 'settings',
}

function getPageFromHash(): VisiblePageId {
  const raw = window.location.hash.replace(/^#\/?/, '')

  if (visiblePages.has(raw as VisiblePageId)) {
    return raw as VisiblePageId
  }

  return legacyRedirects[raw] ?? 'chat'
}

export default function App() {
  const [page, setPage] = useState<VisiblePageId>(() => getPageFromHash())
  const [, startTransition] = useTransition()
  const { createThread, state } = useArtemisApp()

  const currentPageLabel =
    navigationItems.find((item) => item.id === page)?.label ?? 'Artemis'

  useEffect(() => {
    const handleHashChange = () => {
      startTransition(() => setPage(getPageFromHash()))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [startTransition])

  useEffect(() => {
    document.title = `Artemis - ${currentPageLabel}`
  }, [currentPageLabel])

  useEffect(() => {
    const applyTheme = () => {
      const resolvedTheme =
        state.settings.theme === 'light'
          ? 'light'
          : 'dark'

      document.documentElement.dataset.theme = resolvedTheme
    }

    applyTheme()
    return undefined
  }, [state.settings.theme])

  const navigate = (nextPage: PageId) => {
    const resolved = visiblePages.has(nextPage as VisiblePageId)
      ? (nextPage as VisiblePageId)
      : legacyRedirects[nextPage] ?? 'chat'

    if (resolved === page) {
      return
    }

    window.location.hash = `/${resolved}`
  }

  return (
    <div className="crew-shell">
      <aside className="sidebar">
        <div className="sidebar__top">
          <div className="sidebar__brandRow">
            <button className="brand-mark" onClick={() => navigate('chat')} type="button">
              Artemis
            </button>

            <div className="sidebar__actions">
              <button
                aria-label="새 채팅"
                className="sidebar__actionButton"
                onClick={() => {
                  createThread()
                  navigate('chat')
                }}
                type="button"
              >
                <Icon name="plus" size={18} />
              </button>
              <button
                aria-label="시그널로 이동"
                className="sidebar__actionButton"
                onClick={() => navigate('signals')}
                type="button"
              >
                <Icon name="search" size={18} />
              </button>
              <button
                aria-label="뒤로"
                className="sidebar__actionButton"
                onClick={() => {
                  if (window.history.length > 1) {
                    window.history.back()
                    return
                  }

                  navigate('chat')
                }}
                type="button"
              >
                <Icon name="chevron-left" size={18} />
              </button>
            </div>
          </div>

          <nav className="sidebar__nav">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                aria-current={page === item.id ? 'page' : undefined}
                className={`nav-item ${page === item.id ? 'is-active' : ''}`}
                onClick={() => navigate(item.id)}
                type="button"
              >
                <span className="nav-item__leading">
                  <span className="nav-item__icon">
                    <Icon name={item.icon} size={18} />
                  </span>
                  <span>{item.label}</span>
                </span>
                <span className="nav-item__hotkey">{item.hotkey}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <main className="page-frame">
        <CrewPage page={page} onNavigate={navigate} />
      </main>
    </div>
  )
}
