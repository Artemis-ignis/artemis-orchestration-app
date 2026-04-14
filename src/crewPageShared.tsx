import type { ReactNode } from 'react'
import { Icon } from './icons'

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
  return (
    <div className="page-intro">
      <div className="page-intro__main">
        {icon ? (
          <span className="page-intro__icon">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      {trailing ? <div className="page-intro__trailing">{trailing}</div> : null}
    </div>
  )
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
    <label className="search-field">
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
    <div className="empty-state">
      <div aria-hidden="true" className="empty-state__mark" />
      <h2>{title}</h2>
      <p>{description}</p>
      {action || secondaryAction ? (
        <div className="empty-state__actions">
          {action ? (
            <button className="primary-button" onClick={onAction} type="button">
              {action}
            </button>
          ) : null}
          {secondaryAction ? (
            <button className="ghost-button" onClick={onSecondaryAction} type="button">
              {secondaryAction}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
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
    <details className={`disclosure ${className}`.trim()} open={defaultOpen}>
      <summary className="disclosure__summary">
        <div className="disclosure__copy">
          <strong>{title}</strong>
          {summary ? <small>{summary}</small> : null}
        </div>
        <span className="disclosure__meta">펼치기</span>
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  )
}
