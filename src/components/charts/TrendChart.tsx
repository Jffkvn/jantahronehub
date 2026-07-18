import { ChartFrame } from './ChartFrame'

export interface ChartDatum {
  label: string
  value: number
}

interface TrendChartProps {
  title: string
  summary: string
  data: ChartDatum[]
  formatValue?: (value: number) => string
}

const width = 640
const height = 230
const inset = 28

export function TrendChart({ title, summary, data, formatValue = String }: TrendChartProps) {
  if (data.length === 0) return <ChartFrame title={title} summary={summary} empty />

  const values = data.map((item) => item.value)
  const maximum = Math.max(...values)
  const minimum = Math.min(...values)
  const range = maximum - minimum || 1
  const step = data.length > 1 ? (width - inset * 2) / (data.length - 1) : 0
  const points = data.map((item, index) => ({
    x: inset + step * index,
    y: height - inset - ((item.value - minimum) / range) * (height - inset * 2),
    ...item,
  }))
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${path} L ${points.at(-1)?.x ?? inset} ${height - inset} L ${points[0].x} ${height - inset} Z`
  const description = data.map((item) => `${item.label} ${formatValue(item.value)}`).join(', ')

  return (
    <ChartFrame title={title} summary={summary}>
      <div className="oh-trend-chart">
        <svg role="img" aria-label={`${title}: ${description}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="oh-trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => <line className="oh-chart-gridline" key={fraction} x1={inset} x2={width - inset} y1={height * fraction} y2={height * fraction} />)}
          <path d={area} fill="url(#oh-trend-fill)" />
          <path className="oh-trend-chart__line" d={path} />
          {points.map((point) => <circle className="oh-trend-chart__point" key={point.label} cx={point.x} cy={point.y} r="4" />)}
        </svg>
        <ol className="oh-chart-axis" aria-hidden="true">
          {data.map((item) => <li key={item.label}>{item.label}</li>)}
        </ol>
      </div>
    </ChartFrame>
  )
}
