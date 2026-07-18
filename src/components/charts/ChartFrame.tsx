import type { ReactNode } from 'react'

interface ChartFrameProps {
  title: string
  summary: string
  children?: ReactNode
  empty?: boolean
  action?: ReactNode
}

export function ChartFrame({ title, summary, children, empty = false, action }: ChartFrameProps) {
  return (
    <section className="oh-chart-frame">
      <header className="oh-chart-frame__header">
        <div>
          <h2>{title}</h2>
          <p>{summary}</p>
        </div>
        {action ? <div>{action}</div> : null}
      </header>
      {empty ? <p className="oh-chart-frame__empty">No data available yet.</p> : <div className="oh-chart-frame__body">{children}</div>}
    </section>
  )
}
