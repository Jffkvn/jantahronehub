import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({
  title,
  description,
  icon = <Inbox size={22} aria-hidden="true" />,
  action,
}: EmptyStateProps) {
  return (
    <section className="oh-empty-state">
      <div className="oh-empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </section>
  )
}
