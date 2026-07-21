import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export interface QuickAction {
  title: string
  description: string
  icon?: ReactNode
  to?: string
  onSelect?: () => void
}

export interface QuickActionsProps {
  title?: string
  actions: QuickAction[]
}

function ActionContent({ title, description, icon }: QuickAction) {
  return (
    <>
      {icon ? <span className="oh-quick-actions__icon">{icon}</span> : null}
      <span className="oh-quick-actions__copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <ArrowUpRight className="oh-quick-actions__arrow" size={17} aria-hidden="true" />
    </>
  )
}

export function QuickActions({ title = 'Quick actions', actions }: QuickActionsProps) {
  return (
    <section className="oh-quick-actions" aria-label={title}>
      <h2 className="oh-quick-actions__title">{title}</h2>
      <div className="oh-quick-actions__list">
        {actions.map((action) => action.to ? (
          <Link
            aria-label={`${action.title} ${action.description}`}
            className="oh-quick-actions__item"
            key={`${action.title}-${action.to}`}
            to={action.to}
          >
            <ActionContent {...action} />
          </Link>
        ) : (
          <button
            aria-label={`${action.title} ${action.description}`}
            className="oh-quick-actions__item"
            key={action.title}
            type="button"
            onClick={action.onSelect}
          >
            <ActionContent {...action} />
          </button>
        ))}
      </div>
    </section>
  )
}
