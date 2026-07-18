import { useQuery } from '@tanstack/react-query'

import { StatusBadge, type StatusTone } from '../../../components/ui/StatusBadge'
import type { StaffAdvance, StaffAdvancesApi } from '../api/staffAdvances'

const currency = new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', maximumFractionDigits: 0 })
const tones: Record<StaffAdvance['status'], StatusTone> = { pending: 'warning', active: 'success', rejected: 'danger', settled: 'success', written_off: 'neutral', flagged: 'danger', voided: 'neutral' }
export function StaffAdvanceStatus({ status }: { status: StaffAdvance['status'] }) { return <StatusBadge tone={tones[status]}>{status.replace('_', ' ')}</StatusBadge> }

export function StaffAdvanceDetails({ advance, api }: { advance: StaffAdvance; api: StaffAdvancesApi }) {
  const events = useQuery({ queryKey: ['staff-advance-events', advance.id], queryFn: () => api.listEvents(advance.id) })
  const paid = Math.max(0, advance.amount - advance.balanceRemaining)
  return <div className="oh-form">
    <div className="oh-detail-grid"><div className="oh-detail-item"><dt>Employee</dt><dd>{advance.employeeName}</dd></div><div className="oh-detail-item"><dt>Status</dt><dd><StaffAdvanceStatus status={advance.status} /></dd></div><div className="oh-detail-item"><dt>Original amount</dt><dd>{currency.format(advance.amount)}</dd></div><div className="oh-detail-item"><dt>Balance remaining</dt><dd>{currency.format(advance.balanceRemaining)}</dd></div><div className="oh-detail-item"><dt>Monthly deduction</dt><dd>{currency.format(advance.monthlyDeduction)}</dd></div><div className="oh-detail-item"><dt>Repaid</dt><dd>{currency.format(paid)}</dd></div><div className="oh-detail-item"><dt>Deduction starts</dt><dd>{advance.deductionStartMonth}</dd></div><div className="oh-detail-item"><dt>Instalments</dt><dd>{advance.instalments}</dd></div></div>
    <section><h3>Reason</h3><p>{advance.reason}</p>{advance.notes ? <p><strong>Internal note:</strong> {advance.notes}</p> : null}</section>
    <section><h3>History</h3>{events.isLoading ? <p role="status">Loading history…</p> : events.data?.length ? <ol className="oh-leave-file-list">{events.data.map((event) => <li key={event.id}><strong>{event.type.replace('_', ' ')}</strong><span>{event.actorName} · {new Date(event.occurredAt).toLocaleString()}</span>{event.reason ? <small>{event.reason}</small> : null}</li>)}</ol> : <p>No history available.</p>}</section>
  </div>
}
