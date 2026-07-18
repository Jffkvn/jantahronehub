import { AlertCircle, FileText } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { EmptyState } from '../../../components/ui/EmptyState'
import type { SelfServiceProfile } from '../api/selfService'

export function PortalHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className="oh-page-header">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{description}</span>
      </div>
    </header>
  )
}

export function PortalNav() {
  const links = [
    { to: '/my', label: 'Overview', end: true },
    { to: '/my/profile', label: 'Profile' },
    { to: '/my/documents', label: 'Documents' },
    { to: '/my/leave', label: 'Leave' },
    { to: '/my/advances', label: 'Advances' },
    { to: '/my/performance', label: 'Performance' },
    { to: '/my/training', label: 'Training' },
    { to: '/my/payslips', label: 'Payslips' },
  ]

  return (
    <nav className="oh-portal-tabs" aria-label="My workspace sections">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.end}
          className={({ isActive }) =>
            isActive ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="oh-detail-grid">{children}</dl>
}

export function DetailItem({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  return (
    <div className="oh-detail-item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

export function MissingProfileState() {
  return (
    <EmptyState
      icon={<AlertCircle />}
      title="Your employee profile is not linked yet"
      description="Ask HR or the OneHub administrator to link your account to your employee record."
    />
  )
}

export function ProfileSummaryCard({ profile }: { profile: SelfServiceProfile }) {
  return (
    <article className="oh-portal-profile-card">
      <div className="oh-portal-avatar" aria-hidden="true">
        {profile.legalName
          .split(' ')
          .slice(0, 2)
          .map((part) => part[0])
          .join('')
          .toUpperCase()}
      </div>
      <div>
        <p>{profile.employeeNumber}</p>
        <h2>{profile.legalName}</h2>
        <span>{profile.jobTitleName ?? 'Role not assigned'}</span>
      </div>
    </article>
  )
}

export function EmptyPayslipState() {
  return (
    <EmptyState
      icon={<FileText />}
      title="No payslips are available yet"
      description="Payslips will appear here after payroll runs are generated and published."
    />
  )
}
