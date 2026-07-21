import { formatKampalaDate } from '../../lib/date/formatKampalaDate'

interface DashboardHeaderProps {
  displayName: string
  eyebrow: string
  title: string
  description: string
}

export function DashboardHeader({ displayName, eyebrow, title, description }: DashboardHeaderProps) {
  const firstName = displayName.trim().split(/\s+/)[0] || 'there'

  return (
    <header className="oh-role-dashboard__header">
      <div>
        <p className="oh-role-dashboard__date">{formatKampalaDate()}</p>
        <p className="oh-role-dashboard__eyebrow">{eyebrow}</p>
        <h1>Welcome back, {firstName} <span aria-hidden="true">👋</span></h1>
        <p>{description}</p>
      </div>
      <div className="oh-role-dashboard__context" aria-label="Current workspace">
        <small>{title}</small>
        <strong>Egypro Uganda</strong>
      </div>
    </header>
  )
}
