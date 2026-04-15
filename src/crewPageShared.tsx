import type { ReactNode } from 'react'
import { Icon } from './icons'
import {
  EmptyStateCard,
  PageHeader,
  PanelCard,
  SectionHeader,
  SplitPane,
  StatCard,
  StatusPill,
  Toolbar,
} from './components/ui/primitives'

export {
  EmptyStateCard as PrimitiveEmptyState,
  PageHeader as PrimitivePageHeader,
  PanelCard,
  SectionHeader,
  SplitPane,
  StatCard,
  StatusPill,
  Toolbar,
}

export function PageIntro({
  title,
  description,
  icon,
  trailing,
}: {
  title: string
  description: string
  icon?: 'insights' | 'settings' | 'agent' | 'signals' | 'tools' | 'files'
  trailing?: ReactNode
}) {
  return <PageHeader icon={icon} title={title} description={description} actions={trailing} />
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="ui-search">
      <Icon name="search" size={16} />
      <input
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        type="search"
        value={value}
      />
    </label>
  )
}

export function Toggle({
  on,
  onToggle,
  label,
}: {
  on: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={on}
      className={`toggle ${on ? 'is-on' : ''}`}
      onClick={onToggle}
      type="button"
    />
  )
}

export function EmptyState({
  title,
  description,
  action,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  title: string
  description: string
  action?: string
  onAction?: () => void
  secondaryAction?: string
  onSecondaryAction?: () => void
}) {
  return (
    <EmptyStateCard
      action={action}
      description={description}
      onAction={onAction}
      onSecondaryAction={onSecondaryAction}
      secondaryAction={secondaryAction}
      title={title}
    />
  )
}

export function DisclosureSection({
  title,
  summary,
  defaultOpen = false,
  className = '',
  children,
}: {
  title: string
  summary?: string
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <details className={`ui-disclosure ${className}`.trim()} open={defaultOpen}>
      <summary className="ui-disclosure__summary">
        <div className="ui-disclosure__copy">
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </div>
        <span className="ui-disclosure__meta">{defaultOpen ? '접힘' : '펼침'}</span>
      </summary>
      <div className="ui-disclosure__body">{children}</div>
    </details>
  )
}
