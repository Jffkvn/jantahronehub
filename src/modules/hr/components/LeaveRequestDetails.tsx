import { useQuery } from '@tanstack/react-query'

import type { LeaveApi, LeaveRequest } from '../api/leave'
import { LeaveStatusBadge } from './LeaveStatusBadge'

export function LeaveRequestDetails({ request, api, showHistory = true }: { request: LeaveRequest; api: LeaveApi; showHistory?: boolean }) {
  const documents = useQuery({ queryKey: ['leave-documents', request.id], queryFn: () => api.listDocuments(request.id) })
  const events = useQuery({ queryKey: ['leave-events', request.id], queryFn: () => api.listEvents?.(request.id) ?? Promise.resolve([]), enabled: showHistory })
  return <div className="oh-form-stack"><section className="oh-card"><h2>{request.employeeName ?? 'Employee'} · {request.leaveTypeName}</h2><p>{request.startDate} to {request.endDate} · {request.workingDays} working days</p><p>{request.reason}</p><LeaveStatusBadge status={request.status} /></section><section className="oh-card"><h2>Supporting evidence</h2>{documents.data?.length ? <ul>{documents.data.map((document) => <li key={document.id}><button className="oh-link-button" onClick={async () => window.open(await api.createDocumentDownload(document.storagePath), '_blank', 'noopener,noreferrer')}>{document.originalFileName}</button></li>)}</ul> : <p>No supporting documents.</p>}</section>{showHistory ? <section className="oh-card"><h2>Request history</h2>{events.data?.length ? <ol>{events.data.map((event) => <li key={event.id}><strong>{event.actorName}</strong> · {event.type.replaceAll('_', ' ')} · {new Date(event.occurredAt).toLocaleString()}{event.reason ? <p>{event.reason}</p> : null}</li>)}</ol> : <p>No history recorded.</p>}</section> : null}</div>
}
