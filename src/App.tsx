import { Suspense, lazy, useCallback, useEffect, useState, useTransition } from 'react'
import './App.css'
import { navigationItems, type PageId, type VisiblePageId } from './crewData'
import { AppShell, SidebarNav, type SidebarItem } from './components/ui/AppShell'
import { PanelCard, StatCard, StatusPill } from './components/ui/primitives'
import { useArtemisApp } from './state/context'

const NEW_CHAT_LABEL = '새 채팅'
const LOADING_SUFFIX = '불러오는 중'
const LOADING_DESCRIPTION = '화면과 관련 상태를 불러오고 있습니다.'
const HOME_LABEL = 'Artemis 작업 콘솔'
const PRIMARY_NAV_LABEL = '주요 메뉴'
const SUPPORT_NAV_LABEL = '도구와 관리'
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
  const [, startTransition] = useTransition()
  const { bridgeHealth, createThread, state, workspaceAbsolutePath, workspaceCurrentPath } =
    useArtemisApp()

  const readyProviderCount = bridgeHealth?.providers.filter((item) => item.ready).length ?? 0
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

  const mapNavItem = (item: (typeof navigationItems)[number]): SidebarItem => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    active: page === item.id,
    hotkey: item.hotkey,
    onClick: () => navigate(item.id),
  })

  return (
    <>
      <a className="skip-link" href="#main-content">
        {SKIP_TO_CONTENT_LABEL}
      </a>

      <AppShell
        sidebar={
          <SidebarNav
            brand={
              <button
                aria-label={HOME_LABEL}
                className="app-brand"
                onClick={() => navigate('chat')}
                title={HOME_LABEL}
                type="button"
              >
                <span className="app-brand__mark" aria-hidden="true" />
                <span>Artemis</span>
              </button>
            }
            primaryAction={
              <button
                aria-label={NEW_CHAT_LABEL}
                aria-keyshortcuts="N"
                className="app-primary-action"
                onClick={() => {
                  createThread()
                  navigate('chat')
                }}
                title={NEW_CHAT_LABEL}
                type="button"
              >
                <span className="app-primary-action__plus">+</span>
                <span>{NEW_CHAT_LABEL}</span>
              </button>
            }
            sections={[
              { label: PRIMARY_NAV_LABEL, items: workspaceNavigationItems.map(mapNavItem) },
              { label: SUPPORT_NAV_LABEL, items: supportNavigationItems.map(mapNavItem) },
            ]}
            footer={
              <PanelCard className="app-sidebar__status" tone="muted">
                <div className="app-sidebar__statusGrid">
                  <StatCard
                    label="실행기"
                    meta={readyProviderCount > 0 ? '연결 확인 완료' : '확인 필요'}
                    tone={readyProviderCount > 0 ? 'success' : 'muted'}
                    value={`${readyProviderCount}개 준비`}
                  />
                  <StatCard label="작업 위치" meta={workspaceLocation.title} value={workspaceLocation.label} />
                </div>
              </PanelCard>
            }
          />
        }
      >
        <div id="main-content" tabIndex={-1}>
          <div className="app-frame__statusRow app-frame__statusRow--top">
            <StatusPill tone="muted">Premium AI Operator Console</StatusPill>
            <StatusPill tone={readyProviderCount > 0 ? 'success' : 'warning'}>
              {readyProviderCount > 0 ? `${readyProviderCount}개 실행기 준비` : '실행기 확인 필요'}
            </StatusPill>
            <StatusPill tone="muted">{workspaceLocation.label}</StatusPill>
          </div>

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
