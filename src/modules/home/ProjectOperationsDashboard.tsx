import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ClipboardCheck, FolderKanban, ShieldCheck } from 'lucide-react'

import { BarChart } from '../../components/charts/BarChart'
import { DonutChart } from '../../components/charts/DonutChart'
import { ActivityList } from '../../components/ui/ActivityList'
import { MetricCard } from '../../components/ui/MetricCard'
import { Panel } from '../../components/ui/Panel'
import type { ModuleKey } from '../../config/modules'
import { projectsApi } from '../projects/api/projects'
import { DashboardHeader } from './DashboardHeader'
import { DashboardQuickActions, DashboardState, formatDashboardDate, groupCounts } from './RoleDashboard'

interface ProjectOperationsDashboardProps {
  displayName: string
  enabledModules: readonly ModuleKey[]
  mode: 'project_manager' | 'coordinator'
}

export function ProjectOperationsDashboard({ displayName, enabledModules, mode }: ProjectOperationsDashboardProps) {
  const dashboard = useQuery({
    queryKey: ['dashboard', mode],
    queryFn: async () => {
      const [projects, updates] = await Promise.all([projectsApi.getProjects(), projectsApi.getDailyUpdates()])
      return { projects, updates }
    },
  })
  if (dashboard.isPending) return <DashboardState>Preparing your project workspace…</DashboardState>
  if (dashboard.isError) return <DashboardState tone="error">Your project overview could not be loaded. Assigned Projects and Daily Tracker remain available from the navigation.</DashboardState>

  const { projects, updates } = dashboard.data
  const active = projects.filter((project) => project.status === 'active').length
  const atRisk = projects.filter((project) => project.health_status === 'at_risk').length
  const awaitingReview = updates.filter((update) => update.status === 'submitted').length
  const endorsed = updates.filter((update) => update.status === 'endorsed').length
  const updatesPerProject = projects.map((project) => ({
    label: project.name,
    value: updates.filter((update) => update.project_id === project.id).length,
  })).filter((item) => item.value > 0).slice(0, 6)
  const manager = mode === 'project_manager'

  return (
    <div className="oh-role-dashboard">
      <DashboardHeader displayName={displayName} eyebrow={manager ? 'Project delivery leadership' : 'Assigned field delivery'} title={manager ? 'Project Manager workspace' : 'Coordinator workspace'} description={manager ? 'See delivery health, review field updates and keep project operations moving.' : 'Open assigned projects, record field progress and request the resources needed on site.'} />
      <section className="oh-role-dashboard__metrics" aria-label="Project metrics">
        <MetricCard label="Active projects" value={active} detail={`${projects.length} visible assignments`} icon={<FolderKanban size={20} />} to="/projects" />
        <MetricCard label="At-risk projects" value={atRisk} detail="Need delivery attention" icon={<AlertTriangle size={20} />} tone="rose" to="/projects" />
        <MetricCard label={manager ? 'Awaiting review' : 'Submitted updates'} value={manager ? awaitingReview : updates.filter((update) => update.status !== 'draft').length} detail={manager ? 'Coordinator updates' : 'Across assigned projects'} icon={<ClipboardCheck size={20} />} tone="amber" to="/tracker/daily-updates" />
        <MetricCard label="Endorsed updates" value={endorsed} detail="Accepted field progress" icon={<ShieldCheck size={20} />} tone="blue" to="/tracker/daily-updates" />
      </section>
      <section className="oh-role-dashboard__grid">
        <DonutChart title="Project status" summary="Visible projects grouped by current operational status." data={groupCounts(projects.map((project) => project.status))} />
        <BarChart title="Field update activity" summary="Recorded updates across the most active projects." data={updatesPerProject} />
      </section>
      <section className="oh-role-dashboard__grid oh-role-dashboard__grid--support">
        <Panel title="Recent field updates" description={manager ? 'Open an update to endorse it or request a revision.' : 'Latest progress shared by the assigned project team.'}>
          <ActivityList items={updates.slice(0, 5).map((update) => ({ id: update.id, title: update.projects?.name || 'Project update', detail: `${update.profiles_submitted_by?.display_name || 'Team member'} · ${update.status.replaceAll('_', ' ')}`, timestamp: formatDashboardDate(update.created_at), to: `/projects/${update.project_id}/updates` }))} emptyMessage="No field updates have been recorded." />
        </Panel>
        <Panel title="Project quick actions" description="Your most common delivery workflows."><DashboardQuickActions kind={mode} enabledModules={enabledModules} /></Panel>
      </section>
    </div>
  )
}
