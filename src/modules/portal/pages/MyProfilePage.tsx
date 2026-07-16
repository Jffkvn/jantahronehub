import { BriefcaseBusiness, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react'

import type { SelfServiceProfile } from '../api/selfService'
import { formatDate, formatLabel } from './formatters'
import {
  DetailGrid,
  DetailItem,
  MissingProfileState,
  PortalHeader,
  ProfileSummaryCard,
} from './shared'

export function MyProfilePage({ profile }: { profile: SelfServiceProfile | null }) {
  if (!profile) return <MissingProfileState />

  return (
    <>
      <PortalHeader
        eyebrow="Employee record"
        title="My Profile"
        description="Review your basic employment and contact information."
      />
      <ProfileSummaryCard profile={profile} />
      <div className="oh-portal-grid">
        <article className="oh-portal-panel">
          <h2>
            <UserRound size={18} /> Personal information
          </h2>
          <DetailGrid>
            <DetailItem label="Full name" value={profile.legalName} />
            <DetailItem label="Employee number" value={profile.employeeNumber} />
            <DetailItem
              label="Company email"
              value={profile.companyEmail ?? 'Not recorded'}
            />
            <DetailItem
              label="Personal email"
              value={profile.personalEmail ?? 'Not recorded'}
            />
          </DetailGrid>
        </article>
        <article className="oh-portal-panel">
          <h2>
            <BriefcaseBusiness size={18} /> Employment details
          </h2>
          <DetailGrid>
            <DetailItem label="Position / Job title" value={profile.jobTitleName ?? 'Not assigned'} />
            <DetailItem label="Department" value={profile.departmentName ?? 'Not assigned'} />
            <DetailItem label="Pay grade" value={profile.payGradeName ?? 'Not assigned'} />
            <DetailItem label="Employment type" value={formatLabel(profile.employmentType)} />
            <DetailItem label="Start date" value={formatDate(profile.startDate)} />
          </DetailGrid>
        </article>
        <article className="oh-portal-panel">
          <h2>
            <ShieldCheck size={18} /> Contract and probation
          </h2>
          <DetailGrid>
            <DetailItem label="Contract type" value={formatLabel(profile.contractType)} />
            <DetailItem label="Contract end date" value={formatDate(profile.endDate)} />
            <DetailItem label="Probation status" value={formatLabel(profile.probationStatus)} />
            <DetailItem label="Probation end date" value={formatDate(profile.probationEndDate)} />
          </DetailGrid>
        </article>
        <article className="oh-portal-panel">
          <h2>
            <Phone size={18} /> Contact
          </h2>
          <DetailGrid>
            <DetailItem label="Work phone" value={profile.workPhone ?? 'Not recorded'} />
            <DetailItem
              label="Primary email"
              value={
                <span className="oh-inline-icon">
                  <Mail size={15} /> {profile.companyEmail ?? profile.personalEmail ?? 'Not recorded'}
                </span>
              }
            />
          </DetailGrid>
        </article>
      </div>
    </>
  )
}
