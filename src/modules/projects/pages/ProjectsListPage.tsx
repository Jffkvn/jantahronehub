import { useQuery } from '@tanstack/react-query'
import { Activity, BriefcaseBusiness, CirclePause, CircleCheckBig, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '../../../components/ui/EmptyState'
import { MetricCard } from '../../../components/ui/MetricCard'
import { DonutChart } from '../../../components/charts/DonutChart'
import { ProgressList } from '../../../components/charts/ProgressList'
import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import { useAuth } from '../../auth/AuthProvider'
import { projectsApi, type Project } from '../api/projects'
import { projectQueryKeys } from '../types'

const statusLabels: Record<Project['status'], string> = {
  planned: 'Planned',
  active: 'Active',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
  archived: 'Archived',
}

function healthPresentation(health: Project['health_status']): { label: string; tone: StatusTone } {
  if (health === 'at_risk') return { label: 'At risk', tone: 'danger' }
  if (health === 'needs_attention') return { label: 'Needs attention', tone: 'warning' }
  return { label: 'On track', tone: 'success' }
}

export function ProjectsListPage() {
  const { access } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | Project['status']>('all')
  const query = useQuery({
    queryKey: projectQueryKeys.lists(),
    queryFn: projectsApi.getProjects,
  })
  const projects = useMemo(() => query.data ?? [], [query.data])
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase()
    return projects.filter((project) => {
      const matchesStatus = status === 'all' || project.status === status
      const matchesSearch = !term || [
        project.project_code,
        project.name,
        project.client_name,
        project.site_location,
      ].some((value) => value?.toLocaleLowerCase().includes(term))
      return matchesStatus && matchesSearch
    })
  }, [projects, search, status])
  const canCreate = access?.permissionKeys.includes('projects.create')

  const counts = {
    active: projects.filter((project) => project.status === 'active').length,
    atRisk: projects.filter((project) => project.health_status === 'at_risk').length,
    onHold: projects.filter((project) => project.status === 'on_hold').length,
    completed: projects.filter((project) => project.status === 'completed').length,
  }
  const totalProjects = projects.length
  const attentionCount = projects.filter((project) => ['at_risk', 'needs_attention'].includes(project.health_status)).length

  return (
    <section className="oh-workspace-page oh-projects-page">
      <header className="oh-page-header">
        <div>
          <p>Operations</p>
          <h1>Projects</h1>
          <span>One place for project teams, field progress, cash, and equipment.</span>
        </div>
        {canCreate ? <Link className="oh-button oh-button--primary" to="/projects/new"><Plus size={17} /> Create project</Link> : null}
      </header>

      <section className="oh-projects-metrics" aria-label="Project status summary">
        <MetricCard label="Active projects" value={counts.active} detail={`${totalProjects} projects in the workspace`} icon={<BriefcaseBusiness />} tone="emerald" />
        <MetricCard label="At risk" value={counts.atRisk} detail={counts.atRisk ? 'Requires operational attention' : 'No critical projects'} icon={<Activity />} tone="rose" />
        <MetricCard label="On hold" value={counts.onHold} detail={counts.onHold ? 'Paused delivery work' : 'No paused projects'} icon={<CirclePause />} tone="amber" />
        <MetricCard label="Completed" value={counts.completed} detail="Closed delivery records" icon={<CircleCheckBig />} tone="blue" />
      </section>

      <section className="oh-projects-insights" aria-label="Project delivery insights">
        <DonutChart
          title="Portfolio status"
          summary="Current distribution across the project lifecycle."
          totalLabel="Projects"
          data={[
            { label: 'Planned', value: projects.filter((project) => project.status === 'planned').length },
            { label: 'Active', value: counts.active },
            { label: 'On hold', value: counts.onHold },
            { label: 'Completed', value: counts.completed },
          ].filter((item) => item.value > 0)}
        />
        <ProgressList
          title="Delivery health"
          summary="A quick view of healthy work and projects needing intervention."
          items={totalProjects ? [
            { label: 'On track', value: projects.filter((project) => project.health_status === 'on_track').length, total: totalProjects, detail: 'Proceeding normally' },
            { label: 'Needs attention', value: attentionCount, total: totalProjects, detail: 'At risk or needs attention' },
            { label: 'Completed', value: counts.completed, total: totalProjects, detail: 'Delivery closed' },
          ] : []}
        />
      </section>

      <section className="oh-card oh-projects-directory">
        <div className="oh-projects-toolbar">
          <label className="oh-projects-search">
            <span className="oh-sr-only">Search projects</span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search projects"
              placeholder="Search code, project, client, or location"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            <span className="oh-sr-only">Filter by status</span>
            <select className="oh-input" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {query.isLoading ? <div className="oh-projects-loading" role="status">Loading projects…</div> : null}
        {query.isError ? (
          <EmptyState
            title="Projects could not be loaded"
            description="Check the connection and try again."
            action={<button className="oh-button oh-button--secondary" type="button" onClick={() => void query.refetch()}>Try again</button>}
          />
        ) : null}
        {!query.isLoading && !query.isError && !visible.length ? (
          <EmptyState
            title={projects.length ? 'No projects match these filters' : 'No projects yet'}
            description={projects.length ? 'Adjust the search or status filter.' : 'Create the first project to begin assigning its team and operations.'}
          />
        ) : null}
        {visible.length ? (
          <div className="oh-table-wrap">
            <table className="oh-table">
              <thead><tr><th>Project</th><th>Client / site</th><th>Status</th><th>Health</th><th>Schedule</th></tr></thead>
              <tbody>
                {visible.map((project) => {
                  const health = healthPresentation(project.health_status)
                  return (
                    <tr key={project.id}>
                      <td><Link className="oh-project-link" to={`/projects/${project.id}/summary`}>{project.name}</Link><small>{project.project_code ?? 'Code pending'}</small></td>
                      <td>{project.client_name ?? 'No client'}<small>{project.site_location ?? 'No site location'}</small></td>
                      <td><StatusBadge>{statusLabels[project.status]}</StatusBadge></td>
                      <td><StatusBadge tone={health.tone}>{health.label}</StatusBadge></td>
                      <td>{project.planned_start_date ?? 'Not scheduled'}<small>{project.expected_end_date ? `to ${project.expected_end_date}` : 'End date pending'}</small></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </section>
  )
}
