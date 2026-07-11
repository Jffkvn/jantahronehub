import { CalendarClock, FileText, IdCard, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatusBadge } from '../../../components/ui/StatusBadge'
import type { SelfServiceProfile } from '../api/selfService'
import { formatDate } from './formatters'
import {
  DetailGrid,
  DetailItem,
  EmptyPayslipState,
  MissingProfileState,
  PortalHeader,
  ProfileSummaryCard,
} from './shared'

export function MyDashboardPage({ profile }: { profile: SelfServiceProfile | null }) {
  if (!profile) return <MissingProfileState />

  return (
    <>
      <PortalHeader
        eyebrow="Employee self-service"
        title="My Workspace"
        description="Your employment record, documents and payslips in one place."
      />
      <div className="oh-portal-grid">
        <ProfileSummaryCard profile={profile} />
        <article className="oh-portal-panel">
          <h2>
            <CalendarClock size={18} /> Employment snapshot
          </h2>
          <DetailGrid>
            <DetailItem label="Department" value={profile.departmentName ?? 'Not assigned'} />
            <DetailItem label="Start date" value={formatDate(profile.startDate)} />
            <DetailItem
              label="Status"
              value={
                <StatusBadge tone={profile.active ? 'success' : 'neutral'}>
                  {profile.active ? 'Active' : 'Inactive'}
                </StatusBadge>
              }
            />
          </DetailGrid>
        </article>
      </div>
      <section className="oh-portal-actions" aria-label="My workspace actions">
        <Link className="oh-portal-action" to="/my/profile">
          <UserRound size={20} />
          <span>View profile</span>
        </Link>
        <Link className="oh-portal-action" to="/my/documents">
          <IdCard size={20} />
          <span>Open documents</span>
        </Link>
        <Link className="oh-portal-action" to="/my/payslips">
          <FileText size={20} />
          <span>View payslips</span>
        </Link>
      </section>
      <section className="oh-portal-panel">
        <h2>
          <FileText size={18} /> Latest payslip
        </h2>
        <EmptyPayslipState />
      </section>
    </>
  )
}
