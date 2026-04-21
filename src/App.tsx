import { Suspense, lazy, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import './App.css'
import { navigationItems, type PageId, type VisiblePageId } from './crewData'
import { AppShell, SidebarNav, type SidebarItem } from './components/ui/AppShell'
import { StatusPill } from './components/ui/primitives'
import { Icon } from './icons'
import { useArtemisApp } from './state/context'

const NEW_CHAT_LABEL = '새 채팅'
const LOADING_SUFFIX = '불러오는 중'
const LOADING_DESCRIPTION = '화면과 관련 상태를 불러오고 있습니다.'
const HOME_LABEL = 'Artemis 작업 콘솔'
const PRIMARY_NAV_LABEL = '주요 메뉴'
const SUPPORT_NAV_LABEL = '도구와 관리'
const SUPPORT_NAV_COLLAPSED_LABEL = '더보기'
const SUPPORT_NAV_EXPANDED_LABEL = '접기'
const SKIP_TO_CONTENT_LABEL = '본문으로 바로 이동'
const SHELL_EYEBROW = 'AI 운영 워크스페이스'
const SHELL_CONTEXT_LABEL = '현재 작업 흐름'
const MOBILE_MENU_LABEL = '메뉴 열기'
const MOBILE_DRAWER_LABEL = '탐색 메뉴'
const SHORTCUT_RAIL_LABEL = '빠른 이동'
const NEW_CHAT_HINT = 'N 키로 바로 시작'
const SHELL_DRAWER_ID = 'app-shell-sidebar'

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

function summarizeWorkspaceLocation(workspaceCurrentPath?: string, workspaceAbsolutePath?: string) {
  const resolved = workspaceCurrentPath || workspaceAbsolutePath

  if (!resolved) {
    return {
      label: '작업 폴더 미연결',
      title: '작업 폴더 미연결',
    }
  }

  if (!workspaceCurrentPath || workspaceCurrentPath === workspaceAbsolutePath) {
    return {
      label: '루트 작업 폴더',
      title: '루트 작업 폴더',
    }
  }

  const segments = resolved.split(/[\\/]/).filter(Boolean)
  const leaf = segments.at(-1) || resolved

  return {
    label: leaf,
    title: '현재 작업 폴더',
  }
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
  const [isCompactShell, setIsCompactShell] = useState(() =>
    window.matchMedia('(max-width: 1100px)').matches,
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [, startTransition] = useTransition()
  const mainContentRef = useRef<HTMLDivElement | null>(null)
  const { bridgeHealth, createThread, state, workspaceAbsolutePath, workspaceCurrentPath } =
    useArtemisApp()

  const readyProviderCount = bridgeHealth?.providers.filter((item) => item.ready).length ?? 0
  const runtimeStatusLabel =
    readyProviderCount > 0 ? `${readyProviderCount}개 실행기 준비` : '실행기 확인 필요'
  const workspaceLocation = summarizeWorkspaceLocation(workspaceCurrentPath, workspaceAbsolutePath)
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
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const handleNavigateFromChrome = useCallback(
    (nextPage: PageId) => {
      if (isCompactShell) {
        closeSidebar()
      }
      navigate(nextPage)
    },
    [closeSidebar, isCompactShell, navigate],
  )

  useEffect(() => {
    const handleHashChange = () => {
      if (isCompactShell) {
        closeSidebar()
      }
      startTransition(() => setPage(getPageFromHash()))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [closeSidebar, isCompactShell, startTransition])

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
    const mediaQuery = window.matchMedia('(max-width: 1100px)')

    const syncCompactShell = () => {
      const compact = mediaQuery.matches
      setIsCompactShell(compact)
      if (!compact) {
        setSidebarOpen(false)
      }
    }

    syncCompactShell()
    mediaQuery.addEventListener('change', syncCompactShell)
    return () => mediaQuery.removeEventListener('change', syncCompactShell)
  }, [])

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
    const frame = window.requestAnimationFrame(() => {
      mainContentRef.current?.focus({ preventScroll: true })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [page])

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

      if (event.key === 'Escape' && isCompactShell && sidebarOpen) {
        event.preventDefault()
        closeSidebar()
        return
      }

      if (lowerKey === 'n') {
        event.preventDefault()
        createThread()
        handleNavigateFromChrome('chat')
        return
      }

      const shortcutPage = pageShortcutMap[lowerKey]
      if (shortcutPage) {
        event.preventDefault()
        handleNavigateFromChrome(shortcutPage)
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
  }, [closeSidebar, createThread, handleNavigateFromChrome, isCompactShell, navigate, page, sidebarOpen])

  const mapNavItem = (item: (typeof navigationItems)[number]): SidebarItem => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    active: page === item.id,
    hotkey: item.hotkey,
    onClick: () => handleNavigateFromChrome(item.id),
  })

  return (
    <>
      <a className="skip-link" href="#main-content">
        {SKIP_TO_CONTENT_LABEL}
      </a>

      <AppShell
        mobileBar={
          isCompactShell ? (
            <div className="app-mobile-bar">
              <button
                aria-controls={SHELL_DRAWER_ID}
                aria-expanded={sidebarOpen}
                aria-haspopup="dialog"
                aria-label={MOBILE_MENU_LABEL}
                className="app-mobile-bar__menu"
                onClick={() => setSidebarOpen(true)}
                type="button"
              >
                <Icon name="menu" size={18} />
              </button>
              <div className="app-mobile-bar__copy">
                <span>{SHELL_CONTEXT_LABEL}</span>
                <strong>{currentPageLabel}</strong>
              </div>
              <StatusPill tone={readyProviderCount > 0 ? 'success' : 'warning'}>
                {readyProviderCount > 0 ? `${readyProviderCount}개 준비` : '확인 필요'}
              </StatusPill>
            </div>
          ) : null
        }
        onCloseSidebar={isCompactShell ? closeSidebar : undefined}
        sidebarId={SHELL_DRAWER_ID}
        sidebarLabel={MOBILE_DRAWER_LABEL}
        sidebar={
          <SidebarNav
            brand={
              <div className="app-brandStack">
                <button
                  aria-label={HOME_LABEL}
                  className="app-brand"
                  onClick={() => handleNavigateFromChrome('chat')}
                  title={HOME_LABEL}
                  type="button"
                >
                  <span className="app-brand__mark" aria-hidden="true" />
                  <span>Artemis</span>
                </button>
                <div className="app-brandMeta">
                  <span className="app-brandMeta__eyebrow">{SHELL_EYEBROW}</span>
                  <div className="app-brandMeta__line">
                    <span>{currentPageLabel}</span>
                    <span aria-hidden="true">•</span>
                    <span>{runtimeStatusLabel}</span>
                  </div>
                </div>
              </div>
            }
            context={
              <div className="app-sidebar__context">
                <div className="app-sidebar__contextTop">
                  <span className="app-sidebar__contextLabel">{SHELL_CONTEXT_LABEL}</span>
                  <StatusPill tone={page === 'chat' ? 'accent' : 'muted'}>{currentPageLabel}</StatusPill>
                </div>
                <strong>{workspaceLocation.label}</strong>
                <p>
                  {runtimeStatusLabel} · {workspaceLocation.title}
                </p>
              </div>
            }
            primaryAction={
              <button
                aria-label={NEW_CHAT_LABEL}
                aria-keyshortcuts="N"
                className="app-primary-action"
                onClick={() => {
                  createThread()
                  handleNavigateFromChrome('chat')
                }}
                title={NEW_CHAT_LABEL}
                type="button"
              >
                <span className="app-primary-action__plus">+</span>
                <span className="app-primary-action__copy">
                  <strong>{NEW_CHAT_LABEL}</strong>
                  <small>{NEW_CHAT_HINT}</small>
                </span>
              </button>
            }
            sections={[
              { label: PRIMARY_NAV_LABEL, items: workspaceNavigationItems.map(mapNavItem) },
              {
                label: SUPPORT_NAV_LABEL,
                items: supportNavigationItems.map(mapNavItem),
                collapsible: true,
                collapsedLabel: SUPPORT_NAV_COLLAPSED_LABEL,
                expandedLabel: SUPPORT_NAV_EXPANDED_LABEL,
              },
            ]}
            footer={
              <div className="app-sidebar__shortcutRail">
                <span className="app-sidebar__shortcutLabel">{SHORTCUT_RAIL_LABEL}</span>
                <div className="app-sidebar__shortcutGrid">
                  <small>N 새 채팅</small>
                  <small>C 채팅</small>
                  <small>F 파일</small>
                  <small>O 오케스트레이션</small>
                  <small>G 설정</small>
                  <small>ESC 뒤로</small>
                </div>
              </div>
            }
          />
        }
        sidebarOpen={!isCompactShell || sidebarOpen}
      >
        <div id="main-content" ref={mainContentRef} tabIndex={-1}>
          <Suspense
            fallback={
              <section className="page page-loading">
                <div className="ui-panel ui-panel--muted page-loading__card">
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
        </div>
      </AppShell>
    </>
  )
}
