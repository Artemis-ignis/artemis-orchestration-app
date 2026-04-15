import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { Icon, type IconName } from '../../icons'

type Tone = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  icon?: IconName
  actions?: ReactNode
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-header__copy">
        <div className="ui-page-header__titleRow">
          {icon ? (
            <span className="ui-page-header__icon" aria-hidden="true">
              <Icon name={icon} size={18} />
            </span>
          ) : null}
          <div>
            {eyebrow ? <span className="ui-page-header__eyebrow">{eyebrow}</span> : null}
            <h1>{title}</h1>
          </div>
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  )
}

export function PanelCard({
  title,
  description,
  actions,
  children,
  className = '',
  tone = 'default',
}: {
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  tone?: Tone
}) {
  return (
    <section className={`ui-panel ui-panel--${tone} ${className}`.trim()}>
      {title || description || actions ? (
        <div className="ui-panel__header">
          <div className="ui-panel__copy">
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="ui-panel__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="ui-section-header">
      <div className="ui-section-header__copy">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-section-header__actions">{actions}</div> : null}
    </div>
  )
}

export function Toolbar({
  left,
  right,
  className = '',
}: {
  left?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={`ui-toolbar ${className}`.trim()}>
      <div className="ui-toolbar__left">{left}</div>
      <div className="ui-toolbar__right">{right}</div>
    </div>
  )
}

export function StatusPill({
  tone = 'default',
  children,
  icon,
}: {
  tone?: Tone
  children: ReactNode
  icon?: IconName
}) {
  return (
    <span className={`ui-status-pill ui-status-pill--${tone}`}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  )
}

export function StatCard({
  label,
  value,
  meta,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  meta?: ReactNode
  tone?: Tone
}) {
  return (
    <article className={`ui-stat-card ui-stat-card--${tone}`}>
      <span className="ui-stat-card__label">{label}</span>
      <strong>{value}</strong>
      {meta ? <p>{meta}</p> : null}
    </article>
  )
}

export function SplitPane({
  primary,
  secondary,
  className = '',
}: {
  primary: ReactNode
  secondary: ReactNode
  className?: string
}) {
  return (
    <div className={`ui-split-pane ${className}`.trim()}>
      <div className="ui-split-pane__primary">{primary}</div>
      <aside className="ui-split-pane__secondary">{secondary}</aside>
    </div>
  )
}

export function FormField({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`ui-form-field ${className}`.trim()}>
      <span className="ui-form-field__label">{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function InputShell(props: ComponentPropsWithoutRef<'input'>) {
  return <input {...props} className={`ui-input ${props.className ?? ''}`.trim()} />
}

export function TextareaShell(props: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea {...props} className={`ui-input ui-input--textarea ${props.className ?? ''}`.trim()} />
}

export function SelectShell(props: ComponentPropsWithoutRef<'select'>) {
  return <select {...props} className={`ui-input ${props.className ?? ''}`.trim()} />
}

export function EmptyStateCard({
  title,
  description,
  action,
  secondaryAction,
  onAction,
  onSecondaryAction,
}: {
  title: string
  description: string
  action?: string
  secondaryAction?: string
  onAction?: () => void
  onSecondaryAction?: () => void
}) {
  return (
    <div className="ui-empty-state">
      <div className="ui-empty-state__mark" aria-hidden="true">
        <Icon name="spark" size={18} />
      </div>
      <div className="ui-empty-state__copy">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {action || secondaryAction ? (
        <div className="ui-empty-state__actions">
          {action ? (
            <button className="ghost-button" onClick={onAction} type="button">
              {action}
            </button>
          ) : null}
          {secondaryAction ? (
            <button className="outline-button" onClick={onSecondaryAction} type="button">
              {secondaryAction}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
