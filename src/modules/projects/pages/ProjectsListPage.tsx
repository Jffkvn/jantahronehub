import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { EmptyState } from '../../../components/ui/EmptyState'
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

      <section className="oh-kpi-band" aria-label="Project status summary">
        {[
          ['Active', counts.active],
          ['At risk', counts.atRisk],
          ['On hold', counts.onHold],
          ['Completed', counts.completed],
        ].map(([label, value]) => (
          <div className="oh-kpi-item" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
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
