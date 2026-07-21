import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, BriefcaseBusiness, CalendarDays, ClipboardList } from 'lucide-react'

import { ActivityList } from '../../components/ui/ActivityList'
import { MetricCard } from '../../components/ui/MetricCard'
import { Panel } from '../../components/ui/Panel'
import type { ModuleKey } from '../../config/modules'
import { leaveApi } from '../hr/api/leave'
import { selfServiceApi } from '../portal/api/selfService'
import { DashboardHeader } from './DashboardHeader'
import { DashboardQuickActions, DashboardState, formatDashboardDate } from './RoleDashboard'

export function EmployeeDashboard({ displayName, enabledModules }: { displayName: string; enabledModules: readonly ModuleKey[] }) {
  const dashboard = useQuery({
    queryKey: ['dashboard', 'employee'],
    queryFn: async () => {
      const [profile, leave] = await Promise.all([selfServiceApi.getProfile(), leaveApi.listMine()])
      return { profile, leave }
    },
  })
  if (dashboard.isPending) return <DashboardState>Preparing your personal workspace…</DashboardState>
  if (dashboard.isError) return <DashboardState tone="error">Your personal overview could not be loaded. My Workspace remains available from the navigation.</DashboardState>

  const { profile, leave } = dashboard.data
  const pending = leave.filter((request) => request.status === 'pending').length
  const approved = leave.filter((request) => request.status === 'approved').length

  return (
    <div className="oh-role-dashboard">
      <DashboardHeader displayName={displayName} eyebrow="My Egypro workspace" title="Employee self-service" description="Your employment information, leave, documents, performance and learning in one secure place." />
      <section className="oh-role-dashboard__metrics" aria-label="Employee metrics">
        <MetricCard label="Employment status" value={profile?.active ? 'Active' : 'Review'} detail={profile?.employeeNumber || 'Employee record'} icon={<BadgeCheck size={20} />} to="/my/profile" />
        <MetricCard label="Department" value={profile?.departmentName || 'Not set'} detail={profile?.jobTitleName || 'Job title not set'} icon={<BriefcaseBusiness size={20} />} tone="navy" to="/my/profile" />
        <MetricCard label="Pending leave" value={pending} detail={`${approved} approved requests`} icon={<CalendarDays size={20} />} tone="amber" to="/my/leave" />
        <MetricCard label="Start date" value={formatDashboardDate(profile?.startDate)} detail={profile?.contractType?.replaceAll('_', ' ') || 'Contract not set'} icon={<ClipboardList size={20} />} tone="blue" to="/my/profile" />
      </section>
      <section className="oh-role-dashboard__grid oh-role-dashboard__grid--support">
        <Panel title="Recent leave requests" description="Your latest leave requests and HR decisions.">
          <ActivityList items={[...leave].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((request) => ({ id: request.id, title: request.leaveTypeName, detail: `${request.workingDays} working day${request.workingDays === 1 ? '' : 's'} · ${request.status}`, timestamp: formatDashboardDate(request.createdAt), to: '/my/leave' }))} emptyMessage="You have not submitted a leave request yet." />
        </Panel>
        <Panel title="My quick actions" description="Open the self-service tools available to you."><DashboardQuickActions kind="employee" enabledModules={enabledModules} /></Panel>
      </section>
      <Panel title="Employment snapshot" description="The current information held in your employee record.">
        <dl className="oh-role-dashboard__profile-grid">
          <div><dt>Legal name</dt><dd>{profile?.legalName || displayName}</dd></div>
          <div><dt>Employee number</dt><dd>{profile?.employeeNumber || 'Not recorded'}</dd></div>
          <div><dt>Job title</dt><dd>{profile?.jobTitleName || 'Not recorded'}</dd></div>
          <div><dt>Pay grade</dt><dd>{profile?.payGradeName || 'Not recorded'}</dd></div>
        </dl>
      </Panel>
    </div>
  )
}
