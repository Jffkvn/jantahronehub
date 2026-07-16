import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, MapPin, UsersRound } from 'lucide-react'
import { Link, NavLink } from 'react-router-dom'

import { StatusBadge } from '../../../components/ui/StatusBadge'
import { projectsApi } from '../api/projects'
import { projectQueryKeys } from '../types'
import { ProjectTeamTab } from './ProjectTeamTab'
import { ProjectUpdatesTab } from './ProjectUpdatesTab'
import { ProjectCashTab } from './ProjectCashTab'
import { ProjectInventoryTab } from './ProjectInventoryTab'
import { ProjectDocumentsTab } from './ProjectDocumentsTab'
import { ProjectHistoryTab } from './ProjectHistoryTab'
import { ProjectStatusDialog } from '../components/ProjectStatusDialog'

export type ProjectWorkspaceTab = 'summary' | 'team' | 'updates' | 'cash' | 'inventory' | 'documents' | 'history'

const tabs: Array<{ key: ProjectWorkspaceTab; label: string }> = [
  { key: 'summary', label: 'Summary' },
  { key: 'team', label: 'Team' },
  { key: 'updates', label: 'Daily Updates' },
  { key: 'cash', label: 'Cash' },
  { key: 'inventory', label: 'Inventory & Equipment' },
  { key: 'documents', label: 'Documents' },
  { key: 'history', label: 'History' },
]

const headings: Record<ProjectWorkspaceTab, string> = {
  summary: 'Project summary',
  team: 'Project team',
  updates: 'Daily updates',
  cash: 'Project cash',
  inventory: 'Inventory & equipment',
  documents: 'Project documents',
  history: 'Project history',
}

function formatProjectDate(value: string | null | undefined) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`))
}

export function ProjectWorkspacePage({
  projectId,
  activeTab,
}: {
  projectId: string
  activeTab: ProjectWorkspaceTab
}) {
  const projectQuery = useQuery({
    queryKey: projectQueryKeys.detail(projectId),
    queryFn: () => projectsApi.getProject(projectId),
  })
  const assignmentsQuery = useQuery({
    queryKey: projectQueryKeys.assignments(projectId),
    queryFn: () => projectsApi.getAssignments(projectId),
    enabled: activeTab === 'summary' || activeTab === 'team',
  })
  const project = projectQuery.data

  if (projectQuery.isLoading) return <div className="oh-route-loading" role="status"><span /><p>Opening project…</p></div>
  if (!project) return <section className="oh-card"><h1>Project not found</h1><Link to="/projects">Return to projects</Link></section>

  return (
    <section className="oh-workspace-page oh-project-workspace">
      <Link className="oh-back-link" to="/projects"><ArrowLeft size={16} /> All projects</Link>
      <header className="oh-project-identity">
        <div>
          <p>{project.project_code ?? 'Project'}</p>
          <h1>{project.name}</h1>
          <span><MapPin size={15} /> {project.site_location ?? 'Site location pending'} · {project.client_name ?? 'Client pending'}</span>
        </div>
        <div className="oh-project-identity__badges">
          <StatusBadge>{project.status.replace('_', ' ')}</StatusBadge>
          <StatusBadge tone={project.health_status === 'at_risk' ? 'danger' : project.health_status === 'needs_attention' ? 'warning' : 'success'}>
            {project.health_status.replace('_', ' ')}
          </StatusBadge>
          <ProjectStatusDialog projectId={projectId} />
        </div>
      </header>
      <nav className="oh-project-tabs" aria-label="Project workspace">
        {tabs.map((tab) => (
          <NavLink key={tab.key} className={tab.key === activeTab ? 'active' : ''} to={`/projects/${projectId}/${tab.key}`}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <section className="oh-project-tab-content">
        <header className="oh-project-tab-heading"><p>Project workspace</p><h2>{headings[activeTab]}</h2></header>
        {activeTab === 'summary' ? (
          <div className="oh-project-summary-grid">
            <article className="oh-card oh-project-summary-card"><span className="oh-project-summary-card__icon"><CalendarDays /></span><span>Schedule</span><strong>{formatProjectDate(project.planned_start_date) ?? 'Start pending'}</strong><small>{project.expected_end_date ? `Expected by ${formatProjectDate(project.expected_end_date)}` : 'End date pending'}</small></article>
            <article className="oh-card oh-project-summary-card"><span className="oh-project-summary-card__icon"><UsersRound /></span><span>Assigned team</span><strong>{assignmentsQuery.data?.length ?? 0}</strong><small>Primary PM and coordinators</small></article>
            <ProjectCashTab projectId={projectId} compact />
            <ProjectInventoryTab projectId={projectId} compact />
          </div>
        ) : null}
        {activeTab === 'team' ? (
          <ProjectTeamTab projectId={projectId} />
        ) : null}
        {activeTab === 'updates' ? <ProjectUpdatesTab projectId={projectId} /> : null}
        {activeTab === 'cash' ? <ProjectCashTab projectId={projectId} /> : null}
        {activeTab === 'inventory' ? <ProjectInventoryTab projectId={projectId} /> : null}
        {activeTab === 'documents' ? <ProjectDocumentsTab projectId={projectId} /> : null}
        {activeTab === 'history' ? <ProjectHistoryTab projectId={projectId} /> : null}
        {!['summary', 'team', 'updates', 'cash', 'inventory', 'documents', 'history'].includes(activeTab) ? (
          <div className="oh-card"><p>This project-specific ledger is ready for its canonical workflow connection.</p></div>
        ) : null}
      </section>
    </section>
  )
}
