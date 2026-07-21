import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BriefcaseBusiness, CircleDollarSign, UsersRound } from 'lucide-react'

import { DonutChart } from '../../components/charts/DonutChart'
import { ActivityList } from '../../components/ui/ActivityList'
import { MetricCard } from '../../components/ui/MetricCard'
import { Panel } from '../../components/ui/Panel'
import type { ModuleKey } from '../../config/modules'
import { reportsApi } from '../reports/api/reports'
import { DashboardHeader } from './DashboardHeader'
import { DashboardQuickActions, DashboardState, formatCompactCurrency, formatDashboardDate, groupCounts } from './RoleDashboard'

export function ExecutiveDashboard({ displayName, enabledModules }: { displayName: string; enabledModules: readonly ModuleKey[] }) {
  const snapshot = useQuery({ queryKey: ['dashboard', 'executive'], queryFn: reportsApi.getGovernanceSnapshot })

  if (snapshot.isPending) return <DashboardState>Preparing the executive overview…</DashboardState>
  if (snapshot.isError) return <DashboardState tone="error">The executive overview could not be loaded. Your operational modules remain available from the navigation.</DashboardState>

  const data = snapshot.data
  const activeProjects = data.projects.filter((project) => project.status === 'active').length
  const atRiskProjects = data.projects.filter((project) => project.healthStatus === 'at_risk').length
  const disbursed = data.cashReconciliation.reduce((sum, request) => sum + request.amountDisbursed, 0)
  const recentProjects = [...data.projects]
    .filter((project) => project.lastUpdateDate)
    .sort((a, b) => (b.lastUpdateDate ?? '').localeCompare(a.lastUpdateDate ?? ''))
    .slice(0, 5)

  return (
    <div className="oh-role-dashboard">
      <DashboardHeader displayName={displayName} eyebrow="Executive command centre" title="Executive workspace" description="A live, aggregate view of people, projects, cash and operational risk." />
      <section className="oh-role-dashboard__metrics" aria-label="Executive metrics">
        <MetricCard label="Active employees" value={data.workforce.activeCount} detail={`${data.workforce.departmentCounts.length} departments`} icon={<UsersRound size={20} />} to="/reports" />
        <MetricCard label="Active projects" value={activeProjects} detail={`${data.projects.length} total projects`} icon={<BriefcaseBusiness size={20} />} tone="navy" to="/projects" />
        <MetricCard label="Projects at risk" value={atRiskProjects} detail="Require management attention" icon={<AlertTriangle size={20} />} tone="rose" to="/projects" />
        <MetricCard label="Project cash disbursed" value={formatCompactCurrency(disbursed)} detail={`${data.cashReconciliation.length} advances`} icon={<CircleDollarSign size={20} />} tone="amber" to="/cash/advances" />
      </section>
      <section className="oh-role-dashboard__grid">
        <DonutChart title="Project portfolio" summary="Current projects grouped by delivery status." data={groupCounts(data.projects.map((project) => project.status))} />
        <DonutChart title="Workforce distribution" summary="Active headcount by department." data={data.workforce.departmentCounts.map((department) => ({ label: department.departmentName, value: department.count }))} />
      </section>
      <section className="oh-role-dashboard__grid oh-role-dashboard__grid--support">
        <Panel title="Recent project activity" description="Latest recorded field progress across the portfolio.">
          <ActivityList items={recentProjects.map((project) => ({ id: project.id, title: project.name, detail: `${project.siteLocation || 'Site not recorded'} · ${project.healthStatus.replaceAll('_', ' ')}`, timestamp: formatDashboardDate(project.lastUpdateDate), to: `/projects/${project.id}/summary` }))} emptyMessage="No project updates have been recorded yet." />
        </Panel>
        <Panel title="Executive actions" description="Role-authorized shortcuts into operational detail."><DashboardQuickActions kind="executive" enabledModules={enabledModules} /></Panel>
      </section>
    </div>
  )
}
