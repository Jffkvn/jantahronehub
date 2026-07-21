import { useId, type ReactNode } from 'react'

export interface PanelProps {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Panel({ title, description, action, children, className = '' }: PanelProps) {
  const titleId = useId()

  return (
    <section className={['oh-panel', className].filter(Boolean).join(' ')} aria-labelledby={titleId}>
      <header className="oh-panel__header">
        <div className="oh-panel__heading">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="oh-panel__action">{action}</div> : null}
      </header>
      <div className="oh-panel__body">{children}</div>
    </section>
  )
}
