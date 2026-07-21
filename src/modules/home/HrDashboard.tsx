import { useQuery } from '@tanstack/react-query'
import { CalendarCheck2, CalendarClock, UserCheck, UsersRound } from 'lucide-react'

import { DonutChart } from '../../components/charts/DonutChart'
import { ActivityList } from '../../components/ui/ActivityList'
import { MetricCard } from '../../components/ui/MetricCard'
import { Panel } from '../../components/ui/Panel'
import type { ModuleKey } from '../../config/modules'
import { leaveApi } from '../hr/api/leave'
import { reportsApi } from '../reports/api/reports'
import { DashboardHeader } from './DashboardHeader'
import { DashboardQuickActions, DashboardState, formatDashboardDate, groupCounts } from './RoleDashboard'

function kampalaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala' }).format(new Date())
}

export function HrDashboard({ displayName, enabledModules }: { displayName: string; enabledModules: readonly ModuleKey[] }) {
  const dashboard = useQuery({
    queryKey: ['dashboard', 'hr'],
    queryFn: async () => {
      const [snapshot, leave] = await Promise.all([reportsApi.getGovernanceSnapshot(), leaveApi.listForHr()])
      return { snapshot, leave }
    },
  })
  if (dashboard.isPending) return <DashboardState>Preparing the HR overview…</DashboardState>
  if (dashboard.isError) return <DashboardState tone="error">The HR overview could not be loaded. Employee and leave management remain available from the navigation.</DashboardState>

  const { snapshot, leave } = dashboard.data
  const today = kampalaToday()
  const pending = leave.filter((request) => request.status === 'pending')
  const onLeaveToday = leave.filter((request) => request.status === 'approved' && request.startDate <= today && request.endDate >= today)
  const recentLeave = [...leave].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5)

  return (
    <div className="oh-role-dashboard">
      <DashboardHeader displayName={displayName} eyebrow="People operations" title="HR workspace" description="Keep employee records, leave, performance and development moving from one place." />
      <section className="oh-role-dashboard__metrics" aria-label="HR metrics">
        <MetricCard label="Active employees" value={snapshot.workforce.activeCount} detail={`${snapshot.workforce.departmentCounts.length} departments`} icon={<UsersRound size={20} />} to="/hr/employees" />
        <MetricCard label="Pending leave" value={pending.length} detail="Waiting for HR action" icon={<CalendarClock size={20} />} tone="amber" to="/hr/leave" />
        <MetricCard label="On leave today" value={onLeaveToday.length} detail={onLeaveToday.length ? 'Approved absences' : 'Everyone is scheduled in'} icon={<CalendarCheck2 size={20} />} tone="violet" to="/hr/leave" />
        <MetricCard label="Total workforce" value={snapshot.workforce.totalHeadcount} detail="Including inactive records" icon={<UserCheck size={20} />} tone="navy" to="/reports" />
      </section>
      <section className="oh-role-dashboard__grid">
        <DonutChart title="Department distribution" summary="Current active headcount by department." data={snapshot.workforce.departmentCounts.map((department) => ({ label: department.departmentName, value: department.count }))} />
        <DonutChart title="Leave workflow" summary="All recorded leave requests by current status." data={groupCounts(leave.map((request) => request.status))} />
      </section>
      <section className="oh-role-dashboard__grid oh-role-dashboard__grid--support">
        <Panel title="Recent leave activity" description="Newest employee and HR-recorded leave items.">
          <ActivityList items={recentLeave.map((request) => ({ id: request.id, title: request.employeeName || 'Employee', detail: `${request.leaveTypeName} · ${request.status}`, timestamp: formatDashboardDate(request.createdAt), to: '/hr/leave' }))} emptyMessage="No leave activity has been recorded." />
        </Panel>
        <Panel title="HR quick actions" description="Frequently used people-management workflows."><DashboardQuickActions kind="hr" enabledModules={enabledModules} /></Panel>
      </section>
    </div>
  )
}
