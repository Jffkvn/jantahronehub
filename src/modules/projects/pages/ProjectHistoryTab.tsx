import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { projectOperationsApi } from '../api/projectOperations'

const labels: Record<string, string> = {
  'project.created': 'Project created',
  'projects.created': 'Project created',
  'project.updated': 'Project updated',
  'project.assignment_added': 'Team member assigned',
  'project.assignment_ended': 'Team assignment ended',
  'project.status_changed': 'Project status changed',
  'projects.status_changed': 'Project status changed',
  'projects.updated': 'Project updated',
  'projects.member_assigned': 'Team member assigned',
  'projects.member_unassigned': 'Team assignment ended',
  'projects.document_added': 'Project document added',
  'daily_update.saved': 'Daily update recorded',
  'inventory.custody_transferred': 'Equipment custody transferred',
}

export function ProjectHistoryTab({ projectId }: { projectId: string }) {
  const query = useQuery({ queryKey: ['projects', projectId, 'history'], queryFn: () => projectOperationsApi.history(projectId) })
  if (query.isLoading) return <div role="status">Loading project history…</div>
  if (query.isError) return <div className="oh-card">Project history could not be loaded.</div>
  return <div className="oh-project-history">
    {(query.data || []).map((event, index) => <article className="oh-card" key={`${event.occurredAt}-${index}`}>
      <History size={17} /><div><strong>{labels[event.eventType] || event.eventType.replaceAll('.', ' ')}</strong><p>{event.reason || 'Recorded automatically'}</p><small>{event.actorName || 'System'} · {new Date(event.occurredAt).toLocaleString()}</small></div>
    </article>)}
    {!query.data?.length ? <div className="oh-card">No project history recorded yet.</div> : null}
  </div>
}
