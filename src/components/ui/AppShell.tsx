import type { ReactNode } from 'react'
import { Icon, type IconName } from '../../icons'

export type SidebarItem = {
  id: string
  label: string
  icon: IconName
  active?: boolean
  hotkey?: string
  onClick: () => void
}

export function AppShell({
  sidebar,
  footer,
  children,
}: {
  sidebar: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="app-shell">
      <div className="app-shell__sidebar">{sidebar}</div>
      <main className="app-shell__main">
        <div className="app-shell__frame">{children}</div>
        {footer ? <div className="app-shell__footer">{footer}</div> : null}
      </main>
    </div>
  )
}

export function SidebarNav({
  brand,
  primaryAction,
  sections,
  footer,
}: {
  brand: ReactNode
  primaryAction?: ReactNode
  sections: Array<{ label: string; items: SidebarItem[] }>
  footer?: ReactNode
}) {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <div className="app-sidebar__brand">{brand}</div>
        {primaryAction ? <div className="app-sidebar__primary">{primaryAction}</div> : null}
        <div className="app-sidebar__sections">
          {sections.map((section) => (
            <section className="app-sidebar__section" key={section.label}>
              <span className="app-sidebar__sectionLabel">{section.label}</span>
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
            </section>
          ))}
        </div>
      </div>
      {footer ? <div className="app-sidebar__footer">{footer}</div> : null}
    </aside>
  )
}
