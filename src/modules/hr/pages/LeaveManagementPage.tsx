import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Calendar, CalendarPlus, List, Settings } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Modal } from '../../../components/ui/Modal'
import { employeeApi, type EmployeeApi } from '../api/employees'
import { leaveApi, type LeaveApi, type LeaveRequest } from '../api/leave'
import { LeaveCalendar } from '../components/LeaveCalendar'
import { LeaveRequestForm } from '../components/LeaveRequestForm'
import { LeaveRequestDetails } from '../components/LeaveRequestDetails'
import { LeaveSetupPanel } from '../components/LeaveSetupPanel'
import { LeaveStatusBadge } from '../components/LeaveStatusBadge'

export function LeaveManagementPage({ api = leaveApi, employeesApi = employeeApi }: { api?: LeaveApi; employeesApi?: EmployeeApi }) {
  const [logging, setLogging] = useState(false)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const [settingUp, setSettingUp] = useState(false)
  const [selectedRequest, setViewing] = useState<LeaveRequest | null>(null)
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [cancelling, setCancelling] = useState<LeaveRequest | null>(null)
  const [cancellationReason, setCancellationReason] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const types = useQuery({ queryKey: ['leave-types'], queryFn: api.listTypes })
  const requests = useQuery({ queryKey: ['hr-leave-requests'], queryFn: api.listForHr })
  const employees = useQuery({ queryKey: ['employees', 'leave-options'], queryFn: employeesApi.list })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['hr-leave-requests'] })
  const log = useMutation({ mutationFn: async (values: { employeeId?: string; leaveTypeId: string; startDate: string; endDate: string; reason: string }) => {
    if (!values.employeeId) throw new Error('Select an employee.')
    await api.logForEmployee({ ...values, employeeId: values.employeeId })
  }, onSuccess: async () => { setLogging(false); await refresh() } })
  const decide = useMutation({ mutationFn: (input: { requestId: string; decision: 'approved'|'rejected'; reason: string }) => api.decide(input), onSuccess: async () => { setRejecting(null); setRejectionReason(''); await refresh() } })
  const cancel = useMutation({ mutationFn: () => {
    if (!cancelling) throw new Error('Select an approved leave request.')
    return api.cancel({ requestId: cancelling.id, reason: cancellationReason })
  }, onSuccess: async () => { setCancelling(null); setCancellationReason(''); await refresh() } })
  const pending = (requests.data ?? []).filter((request) => request.status === 'pending')
  const approved = (requests.data ?? []).filter((request) => request.status === 'approved')
  const today = new Date().toISOString().slice(0, 10)
  const month = today.slice(0, 7)
  const onLeaveToday = approved.filter((request) => request.startDate <= today && request.endDate >= today)
  const thisMonth = approved.filter((request) => request.startDate.startsWith(month) || request.endDate.startsWith(month))
  const viewing = selectedRequest ?? requests.data?.find((request) => request.id === searchParams.get('request')) ?? null

  const closeDetails = () => {
    setViewing(null)
    if (searchParams.has('request')) {
      const next = new URLSearchParams(searchParams)
      next.delete('request')
      setSearchParams(next, { replace: true })
    }
  }

  return <section>
    <header className="oh-page-header"><div><p>People operations</p><h1>Leave Management</h1><span>Track annual leave, sick days and time off.</span></div><div className="oh-inline-actions"><Button variant="secondary" onClick={() => setSettingUp(true)}><Settings size={18} /> Leave setup</Button><div className="oh-leave-view-toggle"><Button className="oh-button--small" variant={view === 'calendar' ? 'primary' : 'secondary'} onClick={() => setView('calendar')}><Calendar size={16} /> Calendar</Button><Button className="oh-button--small" variant={view === 'list' ? 'primary' : 'secondary'} onClick={() => setView('list')}><List size={16} /> List</Button></div><Button onClick={() => setLogging(true)}><CalendarPlus size={18} /> Log Leave</Button></div></header>
    {(types.isLoading || requests.isLoading || employees.isLoading) ? <p role="status">Loading leave workspace…</p> : null}
    {(types.isError || requests.isError || employees.isError) ? <FormError>Leave workspace could not be loaded.</FormError> : null}
    <div className="oh-leave-kpis"><article className="oh-card"><span>Pending approvals</span><strong>{pending.length}</strong><small>waiting for HR</small></article><article className="oh-card"><span>On leave today</span><strong>{onLeaveToday.length}</strong><small>{onLeaveToday.map((item) => item.employeeName?.split(' ')[0]).filter(Boolean).join(', ') || 'Nobody'}</small></article><article className="oh-card"><span>This month</span><strong>{thisMonth.length}</strong><small>leave records</small></article><article className="oh-card"><span>Total employees</span><strong>{(employees.data ?? []).filter((employee) => employee.active).length}</strong><small>active staff</small></article></div>
    {pending.length ? <section className="oh-card oh-leave-requests"><h2>Pending HR review</h2><div className="oh-table-wrap"><table className="oh-table"><thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Reason</th><th>Actions</th></tr></thead><tbody>{pending.map((request) => <tr key={request.id}><td>{request.employeeName ?? 'Employee'}</td><td>{request.leaveTypeName}</td><td>{request.startDate} to {request.endDate}<small>{request.workingDays} working days</small></td><td>{request.reason}</td><td><div className="oh-inline-actions"><Button className="oh-button--small" variant="secondary" onClick={() => setViewing(request)}>View details</Button><Button className="oh-button--small" loading={decide.isPending} onClick={() => decide.mutate({ requestId: request.id, decision: 'approved', reason: 'Approved by HR' })}>Approve</Button><Button className="oh-button--small" variant="secondary" onClick={() => setRejecting(request)}>Reject</Button></div></td></tr>)}</tbody></table></div></section> : null}
    {view === 'calendar' ? <LeaveCalendar requests={requests.data ?? []} leaveTypes={types.data ?? []} /> : <section className="oh-card oh-leave-requests"><h2>All leave records</h2>{requests.data?.length ? <div className="oh-table-wrap"><table className="oh-table"><thead><tr><th>Employee</th><th>Leave</th><th>Dates</th><th>Days</th><th>Status</th><th>Action</th></tr></thead><tbody>{requests.data.map((request) => <tr key={request.id}><td>{request.employeeName ?? 'Employee'}</td><td>{request.leaveTypeName}</td><td>{request.startDate} to {request.endDate}</td><td>{request.workingDays}</td><td><LeaveStatusBadge status={request.status} /></td><td><div className="oh-inline-actions"><Button className="oh-button--small" variant="secondary" onClick={() => setViewing(request)}>View details</Button>{request.status === 'approved' ? <Button className="oh-button--small" variant="secondary" aria-label={`Cancel ${request.leaveTypeName} for ${request.employeeName ?? 'employee'}`} onClick={() => setCancelling(request)}>Cancel leave</Button> : null}</div></td></tr>)}</tbody></table></div> : <p>No leave has been recorded.</p>}</section>}
    <Modal open={logging} title="Log Leave" onClose={() => setLogging(false)}><LeaveRequestForm leaveTypes={types.data ?? []} employeeOptions={(employees.data ?? []).filter((employee) => employee.active).map((employee) => ({ id: employee.id, name: `${employee.legalName} · ${employee.employeeNumber}` }))} submitting={log.isPending} showDocuments={false} submitLabel="Log Leave" onCancel={() => setLogging(false)} onSubmit={async (values) => log.mutateAsync(values)} />{log.isError ? <FormError>{log.error.message}</FormError> : null}</Modal>
    <Modal open={settingUp} title="Leave setup" onClose={() => setSettingUp(false)}><LeaveSetupPanel api={api} types={types.data ?? []} employees={(employees.data ?? []).filter((employee) => employee.active)} /></Modal>
    <Modal open={Boolean(viewing)} title="Leave request details" onClose={closeDetails}>{viewing ? <LeaveRequestDetails request={viewing} api={api} /> : null}</Modal>
    <Modal open={Boolean(rejecting)} title="Reject leave request" onClose={() => setRejecting(null)}><label className="oh-field"><span className="oh-field__label">Reason for rejection</span><textarea className="oh-input oh-textarea" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} /></label><div className="oh-form-actions"><Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" disabled={rejectionReason.trim().length < 3} loading={decide.isPending} onClick={() => rejecting && decide.mutate({ requestId: rejecting.id, decision: 'rejected', reason: rejectionReason })}>Reject request</Button></div>{decide.isError ? <FormError>{decide.error.message}</FormError> : null}</Modal>
    <Modal open={Boolean(cancelling)} title="Cancel approved leave" onClose={() => setCancelling(null)}><label className="oh-field"><span className="oh-field__label">Reason for cancellation</span><textarea className="oh-input oh-textarea" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} /></label><div className="oh-form-actions"><Button variant="secondary" onClick={() => setCancelling(null)}>Keep leave</Button><Button variant="danger" disabled={cancellationReason.trim().length < 3} loading={cancel.isPending} onClick={() => cancel.mutate()}>Confirm cancellation</Button></div>{cancel.isError ? <FormError>{cancel.error.message}</FormError> : null}</Modal>
  </section>
}
