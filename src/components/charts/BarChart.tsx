import { ChartFrame } from './ChartFrame'
import type { ChartDatum } from './TrendChart'

interface BarChartProps {
  title: string
  summary: string
  data: ChartDatum[]
  formatValue?: (value: number) => string
}

export function BarChart({ title, summary, data, formatValue = String }: BarChartProps) {
  if (data.length === 0) return <ChartFrame title={title} summary={summary} empty />

  const maximum = Math.max(...data.map((item) => item.value), 0)
  const description = data.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')

  return (
    <ChartFrame title={title} summary={summary}>
      <div className="oh-bar-chart" role="img" aria-label={`${title}: ${description}`}>
        {data.map((item) => {
          const percentage = maximum > 0 ? (item.value / maximum) * 100 : 0
          return (
            <div className="oh-bar-chart__item" key={item.label}>
              <span className="oh-bar-chart__value">{formatValue(item.value)}</span>
              <span className="oh-bar-chart__track"><i style={{ height: `${Math.max(percentage, 2)}%` }} /></span>
              <span className="oh-bar-chart__label">{item.label}</span>
            </div>
          )
        })}
      </div>
    </ChartFrame>
  )
}
