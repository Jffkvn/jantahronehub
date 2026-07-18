import { ChartFrame } from './ChartFrame'

export interface ProgressItem {
  label: string
  value: number
  total: number
  detail?: string
}

interface ProgressListProps {
  title: string
  summary: string
  items: ProgressItem[]
}

export function ProgressList({ title, summary, items }: ProgressListProps) {
  if (items.length === 0) return <ChartFrame title={title} summary={summary} empty />

  return (
    <ChartFrame title={title} summary={summary}>
      <ul className="oh-progress-list">
        {items.map((item) => {
          const percentage = item.total > 0 ? Math.round((item.value / item.total) * 100) : 0
          const bounded = Math.min(100, Math.max(0, percentage))
          return (
            <li key={item.label}>
              <div><span><strong>{item.label}</strong>{item.detail ? <small>{item.detail}</small> : null}</span><b>{bounded}%</b></div>
              <span className="oh-progress-list__track" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bounded}><i style={{ width: `${bounded}%` }} /></span>
            </li>
          )
        })}
      </ul>
    </ChartFrame>
  )
}
