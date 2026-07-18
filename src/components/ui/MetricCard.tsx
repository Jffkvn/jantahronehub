import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

export type MetricTone = 'emerald' | 'navy' | 'blue' | 'violet' | 'amber' | 'rose'

export interface MetricCardProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  tone?: MetricTone
  to?: string
}

function MetricContent({ label, value, detail, icon, to }: MetricCardProps) {
  return (
    <>
      <div className="oh-metric-card__topline">
        {icon ? <span className="oh-metric-card__icon">{icon}</span> : null}
        {to ? <ArrowUpRight className="oh-metric-card__arrow" size={17} aria-hidden="true" /> : null}
      </div>
      <span className="oh-metric-card__label">{label}</span>
      <strong className="oh-metric-card__value">{value}</strong>
      {detail ? <small className="oh-metric-card__detail">{detail}</small> : null}
    </>
  )
}

export function MetricCard(props: MetricCardProps) {
  const className = `oh-metric-card oh-metric-card--${props.tone ?? 'emerald'}`

  if (props.to) {
    return (
      <Link
        aria-label={`${props.label} ${typeof props.value === 'string' || typeof props.value === 'number' ? props.value : ''}`.trim()}
        className={`${className} oh-metric-card--linked`}
        to={props.to}
      >
        <MetricContent {...props} />
      </Link>
    )
  }

  return (
    <article className={className}>
      <MetricContent {...props} />
    </article>
  )
}
