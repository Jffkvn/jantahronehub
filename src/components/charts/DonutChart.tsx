import { ChartFrame } from './ChartFrame'
import type { ChartDatum } from './TrendChart'

interface DonutChartProps {
  title: string
  summary: string
  data: ChartDatum[]
  totalLabel?: string
  formatValue?: (value: number) => string
}

const palette = ['var(--color-primary-600)', 'var(--color-cyan-600)', 'var(--color-violet-600)', 'var(--color-amber-600)', 'var(--color-blue-600)', 'var(--color-rose-600)']

export function DonutChart({ title, summary, data, totalLabel = 'Total', formatValue = String }: DonutChartProps) {
  if (data.length === 0) return <ChartFrame title={title} summary={summary} empty />

  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0)
  let cursor = 0
  const segments = data.map((item, index) => {
    const start = cursor
    const share = total > 0 ? (Math.max(0, item.value) / total) * 100 : 0
    cursor += share
    return `${palette[index % palette.length]} ${start}% ${cursor}%`
  })
  const background = total > 0 ? `conic-gradient(${segments.join(', ')})` : 'var(--color-surface-muted)'
  const description = data.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')

  return (
    <ChartFrame title={title} summary={summary}>
      <div className="oh-donut-chart">
        <div className="oh-donut-chart__graphic" role="img" aria-label={`${title}: ${description}`} style={{ background }}>
          <span><strong>{formatValue(total)}</strong><small>{totalLabel}</small></span>
        </div>
        <ul className="oh-donut-chart__legend">
          {data.map((item, index) => {
            const percentage = total > 0 ? Math.round((Math.max(0, item.value) / total) * 100) : 0
            return <li key={item.label}><i style={{ background: palette[index % palette.length] }} /><span>{item.label}</span><strong>{formatValue(item.value)} ({percentage}%)</strong></li>
          })}
        </ul>
      </div>
    </ChartFrame>
  )
}
