import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from '../../icons'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function isVisibleFocusableElement(element: HTMLElement) {
  return element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true'
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isVisibleFocusableElement,
  )
}

export type SidebarItem = {
  id: string
  label: string
  icon: IconName
  active?: boolean
  hotkey?: string
  onClick: () => void
}

export type SidebarSection = {
  label: string
  items: SidebarItem[]
  collapsible?: boolean
  collapsedLabel?: string
  expandedLabel?: string
}

export function AppShell({
  sidebar,
  footer,
  mobileBar,
  sidebarOpen = true,
  sidebarId,
  sidebarLabel = '탐색 메뉴',
  onCloseSidebar,
  children,
}: {
  sidebar: ReactNode
  footer?: ReactNode
  mobileBar?: ReactNode
  sidebarOpen?: boolean
  sidebarId?: string
  sidebarLabel?: string
  onCloseSidebar?: () => void
  children: ReactNode
}) {
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)
  const isModalSidebar = Boolean(onCloseSidebar && sidebarOpen)

  useEffect(() => {
    if (!isModalSidebar) {
      return undefined
    }

    const drawer = sidebarRef.current
    if (!drawer) {
      return undefined
    }

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusDrawer = () => {
      const initialTarget = getFocusableElements(drawer)[0] ?? drawer
      initialTarget.focus({ preventScroll: true })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') {
        return
      }

      const focusableElements = getFocusableElements(drawer)
      if (focusableElements.length === 0) {
        event.preventDefault()
        drawer.focus({ preventScroll: true })
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements.at(-1) ?? firstFocusable
      const activeElement = document.activeElement

      if (!(activeElement instanceof HTMLElement) || !drawer.contains(activeElement)) {
        event.preventDefault()
        firstFocusable.focus({ preventScroll: true })
        return
      }

      if (event.shiftKey && activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus({ preventScroll: true })
      }

      if (!event.shiftKey && activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus({ preventScroll: true })
      }
    }

    const frame = window.requestAnimationFrame(focusDrawer)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocusedElementRef.current?.focus({ preventScroll: true })
      previouslyFocusedElementRef.current = null
    }
  }, [isModalSidebar])

  useEffect(() => {
    if (!isModalSidebar) {
      return undefined
    }

    const bodyStyle = document.body.style
    const documentStyle = document.documentElement.style
    const previousBodyOverflow = bodyStyle.overflow
    const previousBodyPaddingRight = bodyStyle.paddingRight
    const previousDocumentOverflow = documentStyle.overflow
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    bodyStyle.overflow = 'hidden'
    documentStyle.overflow = 'hidden'
    if (scrollbarWidth > 0) {
      bodyStyle.paddingRight = `${scrollbarWidth}px`
    }

    return () => {
      bodyStyle.overflow = previousBodyOverflow
      bodyStyle.paddingRight = previousBodyPaddingRight
      documentStyle.overflow = previousDocumentOverflow
    }
  }, [isModalSidebar])

  return (
    <div className={`app-shell ${sidebarOpen ? 'is-sidebar-open' : ''}`.trim()}>
      {isModalSidebar ? (
        <button
          aria-label="사이드바 닫기"
          className="app-shell__backdrop"
          onClick={() => onCloseSidebar?.()}
          tabIndex={-1}
          type="button"
        />
      ) : null}
      <div
        aria-hidden={Boolean(onCloseSidebar) && !sidebarOpen ? true : undefined}
        aria-label={isModalSidebar ? sidebarLabel : undefined}
        aria-modal={isModalSidebar ? true : undefined}
        className={`app-shell__sidebar ${sidebarOpen ? 'is-open' : ''}`.trim()}
        id={sidebarId}
        ref={sidebarRef}
        role={isModalSidebar ? 'dialog' : undefined}
        tabIndex={isModalSidebar ? -1 : undefined}
      >
        {sidebar}
      </div>
      <main aria-hidden={isModalSidebar ? true : undefined} className="app-shell__main">
        {mobileBar ? <div className="app-shell__mobileBar">{mobileBar}</div> : null}
        <div className="app-shell__frame">{children}</div>
        {footer ? <div className="app-shell__footer">{footer}</div> : null}
      </main>
    </div>
  )
}

export function SidebarNav({
  brand,
  primaryAction,
  context,
  sections,
  footer,
}: {
  brand: ReactNode
  primaryAction?: ReactNode
  context?: ReactNode
  sections: SidebarSection[]
  footer?: ReactNode
}) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      sections.map((section) => [section.label, section.collapsible ? false : true]),
    ),
  )

  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <div className="app-sidebar__brand">{brand}</div>
        {primaryAction ? <div className="app-sidebar__primary">{primaryAction}</div> : null}
        {context ? <div className="app-sidebar__contextSlot">{context}</div> : null}
        <div className="app-sidebar__sections">
          {sections.map((section) => {
            const hasActiveItem = section.items.some((item) => item.active)
            const isExpanded = section.collapsible ? Boolean(expandedSections[section.label]) : true

            return (
              <section className="app-sidebar__section" key={section.label}>
                {section.collapsible ? (
                  <button
                    aria-expanded={isExpanded}
                    className={`app-sidebar__sectionToggle ${isExpanded ? 'is-expanded' : ''} ${
                      hasActiveItem ? 'has-active' : ''
                    }`.trim()}
                    onClick={() =>
                      setExpandedSections((current) => ({
                        ...current,
                        [section.label]: !current[section.label],
                      }))
                    }
                    type="button"
                  >
                    <span className="app-sidebar__sectionToggleCopy">
                      <span>{section.label}</span>
                      <small>{isExpanded ? section.expandedLabel : section.collapsedLabel}</small>
                    </span>
                    <Icon className="app-sidebar__sectionToggleIcon" name="chevron-down" size={16} />
                  </button>
                ) : (
                  <span className="app-sidebar__sectionLabel">{section.label}</span>
                )}
                {isExpanded ? (
                  <nav className="app-sidebar__nav">
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        aria-current={item.active ? 'page' : undefined}
                        className={`app-nav-item ${item.active ? 'is-active' : ''}`}
                        onClick={item.onClick}
                        title={item.hotkey ? `${item.label} (${item.hotkey})` : item.label}
                        type="button"
                      >
                        <span className="app-nav-item__copy">
                          <Icon name={item.icon} size={16} />
                          <span>{item.label}</span>
                        </span>
                        {item.hotkey ? <small>{item.hotkey}</small> : null}
                      </button>
                    ))}
                  </nav>
                ) : null}
              </section>
            )
          })}
        </div>
      </div>
      {footer ? <div className="app-sidebar__footer">{footer}</div> : null}
    </aside>
  )
}
