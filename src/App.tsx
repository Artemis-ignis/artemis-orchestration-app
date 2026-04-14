import { Suspense, lazy, useCallback, useEffect, useState, useTransition } from 'react'
import './App.css'
import { navigationItems, type PageId, type VisiblePageId } from './crewData'
import { Icon } from './icons'
import { useArtemisApp } from './state/context'

const NEW_CHAT_LABEL = '새 채팅'
const LOADING_SUFFIX = '준비 중'
const LOADING_DESCRIPTION = '필요한 화면과 상태를 불러오고 있습니다.'
const HOME_LABEL = 'Artemis 작업 홈'
const PRIMARY_NAV_LABEL = '주요 메뉴'
const SKIP_TO_CONTENT_LABEL = '본문으로 바로 이동'

const CrewPage = lazy(async () => {
  const module = await import('./CrewPages')
  return { default: module.CrewPage }
})

const workspacePageIds: VisiblePageId[] = [
  'chat',
  'files',
  'insights',
  'signals',
  'tools',
  'agents',
  'activity',
  'settings',
]

const hiddenMarketingPages = new Set<PageId>([
  'home',
  'pricing',
  'contact',
  'privacy',
  'terms',
  'start',
  'account',
  'billing-success',
  'billing-cancel',
])

const visiblePages = new Set<PageId>([...workspacePageIds, 'guide'])

const legacyRedirects: Record<string, PageId> = {
  channels: 'chat',
  mail: 'chat',
  marketplace: 'tools',
  billing: 'chat',
}

const pageShortcutMap: Record<string, VisiblePageId> = {
  c: 'chat',
  f: 'files',
  i: 'insights',
  s: 'signals',
  k: 'tools',
  o: 'agents',
  a: 'activity',
  g: 'settings',
}

const workspaceNavigationItems = navigationItems.filter((item) =>
  ['chat', 'files', 'agents'].includes(item.id),
)

const supportNavigationItems = navigationItems.filter((item) =>
  ['signals', 'insights', 'tools', 'activity', 'settings'].includes(item.id),
)

function resolvePage(raw: string): PageId {
  if (visiblePages.has(raw as PageId)) {
    return raw as PageId
  }

  if (hiddenMarketingPages.has(raw as PageId)) {
    return 'chat'
  }

  return legacyRedirects[raw] ?? 'chat'
}

function getPageFromHash(): PageId {
  const raw = window.location.hash.replace(/^#\/?/, '')
  return resolvePage(raw)
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

export default function App() {
  const [page, setPage] = useState<PageId>(() => getPageFromHash())
  const [, startTransition] = useTransition()
  const { bridgeHealth, createThread, state, workspaceAbsolutePath, workspaceCurrentPath } =
    useArtemisApp()

  const readyProviderCount = bridgeHealth?.providers.filter((item) => item.ready).length ?? 0
  const workspaceLocationLabel = workspaceCurrentPath || workspaceAbsolutePath || '작업 루트 미연결'
  const currentPageLabel =
    navigationItems.find((item) => item.id === page)?.label ??
    (page === 'guide' ? '가이드' : 'Artemis')

  const navigate = useCallback(
    (nextPage: PageId) => {
      const resolved = resolvePage(nextPage)

      if (resolved === page) {
        return
      }

      window.location.assign(`#/${resolved}`)
    },
    [page],
  )

  useEffect(() => {
    const handleHashChange = () => {
      startTransition(() => setPage(getPageFromHash()))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [startTransition])

  useEffect(() => {
    const raw = window.location.hash.replace(/^#\/?/, '')

    if (!raw || hiddenMarketingPages.has(raw as PageId)) {
      window.history.replaceState(null, '', '#/chat')
      startTransition(() => setPage('chat'))
    }
  }, [startTransition])

  useEffect(() => {
    document.title = `Artemis - ${currentPageLabel}`
  }, [currentPageLabel])

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [page])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')

    const applyTheme = () => {
      const resolvedTheme =
        state.settings.theme === 'light'
          ? 'light'
          : state.settings.theme === 'system' && mediaQuery.matches
            ? 'light'
            : 'dark'

      document.documentElement.dataset.theme = resolvedTheme
    }

    applyTheme()

    if (state.settings.theme !== 'system') {
      return undefined
    }

    mediaQuery.addEventListener('change', applyTheme)
    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [state.settings.theme])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const lowerKey = event.key.toLowerCase()
      const hasPrimaryModifier = event.metaKey || event.ctrlKey

      if (event.isComposing) {
        return
      }

      if (document.querySelector('.dropdown-menu')) {
        return
      }

      if (isEditableTarget(event.target) || hasPrimaryModifier || event.altKey || event.repeat) {
        return
      }

      if (lowerKey === 'n') {
        event.preventDefault()
        createThread()
        navigate('chat')
        return
      }

      const shortcutPage = pageShortcutMap[lowerKey]
      if (shortcutPage) {
        event.preventDefault()
        navigate(shortcutPage)
        return
      }

      if (event.key === 'Escape' && page !== 'chat') {
        event.preventDefault()

        if (window.history.length > 1) {
          window.history.back()
          return
        }

        navigate('chat')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createThread, navigate, page])

  return (
    <>
      <a className="skip-link" href="#main-content">
        {SKIP_TO_CONTENT_LABEL}
      </a>

      <div className="crew-shell">
        <aside className="sidebar">
          <div className="sidebar__top">
            <div className="sidebar__brandRow">
              <button
                aria-label={HOME_LABEL}
                className="brand-mark"
                onClick={() => navigate('chat')}
                title={HOME_LABEL}
                type="button"
              >
                Artemis
              </button>
            </div>

            <div className="sidebar__utilityList">
              <button
                aria-label={NEW_CHAT_LABEL}
                aria-keyshortcuts="N"
                className="sidebar__primaryAction"
                onClick={() => {
                  createThread()
                  navigate('chat')
                }}
                title={NEW_CHAT_LABEL}
                type="button"
              >
                <Icon name="plus" size={17} />
                <span>{NEW_CHAT_LABEL}</span>
              </button>
            </div>

            <div aria-label={PRIMARY_NAV_LABEL} className="sidebar__sections">
              <section className="sidebar__section">
                <span className="sidebar__sectionLabel">작업</span>
                <nav className="sidebar__nav">
                  {workspaceNavigationItems.map((item) => (
                    <button
                      key={item.id}
                      aria-current={page === item.id ? 'page' : undefined}
                      aria-keyshortcuts={item.hotkey}
                      className={`nav-item ${page === item.id ? 'is-active' : ''}`}
                      onClick={() => navigate(item.id)}
                      title={`${item.label} (${item.hotkey})`}
                      type="button"
                    >
                      <span className="nav-item__leading">
                        <span className="nav-item__icon">
                          <Icon name={item.icon} size={17} />
                        </span>
                        <span>{item.label}</span>
                      </span>
                    </button>
                  ))}
                </nav>
              </section>

              <section className="sidebar__section">
                <span className="sidebar__sectionLabel">도구와 관리</span>
                <nav className="sidebar__nav">
                  {supportNavigationItems.map((item) => (
                    <button
                      key={item.id}
                      aria-current={page === item.id ? 'page' : undefined}
                      aria-keyshortcuts={item.hotkey}
                      className={`nav-item ${page === item.id ? 'is-active' : ''}`}
                      onClick={() => navigate(item.id)}
                      title={`${item.label} (${item.hotkey})`}
                      type="button"
                    >
                      <span className="nav-item__leading">
                        <span className="nav-item__icon">
                          <Icon name={item.icon} size={17} />
                        </span>
                        <span>{item.label}</span>
                      </span>
                    </button>
                  ))}
                </nav>
              </section>
            </div>
          </div>

          <div className="sidebar__bottom">
            <div className="sidebar__meta">
              <span>
                {readyProviderCount > 0 ? `${readyProviderCount}개 실행기 준비됨` : '실행기 상태 확인 필요'}
              </span>
              <strong>{workspaceLocationLabel}</strong>
            </div>
          </div>
        </aside>

        <main className="page-frame" id="main-content" tabIndex={-1}>
          <Suspense
            fallback={
              <section className="page page-loading">
                <div className="panel-card panel-card--muted page-loading__card">
                  <strong>
                    {currentPageLabel} {LOADING_SUFFIX}
                  </strong>
                  <p>{LOADING_DESCRIPTION}</p>
                </div>
              </section>
            }
          >
            <CrewPage page={page as VisiblePageId} onNavigate={navigate} />
          </Suspense>
        </main>
      </div>
    </>
  )
}
