import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Archive, CalendarClock, Mail, Pencil, Phone, UserRound } from 'lucide-react'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Input } from '../../../components/ui/Input'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { employeeApi, type EmployeeApi } from '../api/employees'
import { EmployeeForm } from '../components/EmployeeForm'
import { OffboardingPanel } from '../components/OffboardingPanel'
import { archiveEmployeeSchema, type EmployeeFormValues, type OffboardingValues } from '../schemas/employee'

export function EmployeeDossierPage({ employeeId, api = employeeApi }: { employeeId: string; api?: EmployeeApi }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [offboarding, setOffboarding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [archiveReason, setArchiveReason] = useState('')
  const [archiveError, setArchiveError] = useState('')
  const closeOffboarding = useCallback(() => setOffboarding(false), [])
  const closeEditing = useCallback(() => setEditing(false), [])
  const closeArchiving = useCallback(() => {
    setArchiving(false)
    setArchiveError('')
  }, [])
  const employee = useQuery({ queryKey: ['employees', employeeId], queryFn: () => api.get(employeeId) })
  const offboard = useMutation({ mutationFn: (values: OffboardingValues) => api.offboard(employeeId, values), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); setOffboarding(false) } })
  const update = useMutation({ mutationFn: (values: EmployeeFormValues) => api.update(employeeId, values), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); setEditing(false) } })
  const archive = useMutation({ mutationFn: (reason: string) => api.archive(employeeId, reason), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); navigate('/hr/employees') } })

  if (employee.isLoading) return <p role="status">Opening employee dossier…</p>
  if (employee.isError || !employee.data) return <section className="oh-workspace-page"><h1>Employee unavailable</h1><Link to="/hr/employees">Return to directory</Link></section>
  const record = employee.data

  return <section className="oh-workspace-page">
    <Link className="oh-back-link" to="/hr/employees"><ArrowLeft size={16} /> Employee directory</Link>
    <header className="oh-dossier-header"><div className="oh-avatar"><UserRound aria-hidden="true" /></div><div><p>{record.employeeNumber}</p><h1>{record.legalName}</h1><div className="oh-dossier-meta"><StatusBadge tone={record.active ? 'success' : 'neutral'}>{record.active ? 'Active' : 'Inactive'}</StatusBadge><span>{record.jobTitleName ?? 'Role not assigned'}</span><span>{record.departmentName ?? 'Department not assigned'}</span></div></div><div className="oh-dossier-actions"><Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Edit employee</Button><Button variant="secondary" onClick={() => setOffboarding(true)}><CalendarClock size={16} /> Record exit</Button><Button variant="danger" onClick={() => setArchiving(true)}><Archive size={16} /> Archive employee</Button></div></header>
    <div className="oh-dossier-grid"><article className="oh-info-card"><h2>Contact details</h2><dl><div><dt><Mail size={16} /> Company email</dt><dd>{record.companyEmail ?? 'Not provided'}</dd></div><div><dt><Phone size={16} /> Work phone</dt><dd>{record.workPhone ?? 'Not provided'}</dd></div></dl></article><article className="oh-info-card"><h2>Current employment</h2><dl><div><dt>Start date</dt><dd>{record.startDate ?? 'Not recorded'}</dd></div><div><dt>Last working day</dt><dd>{record.endDate ?? 'Open-ended'}</dd></div></dl></article></div>
    <Modal open={editing} title="Edit employee" onClose={closeEditing}><EmployeeForm profileOnly submitting={update.isPending} initialValues={{ employeeNumber: record.employeeNumber, legalName: record.legalName, preferredName: record.preferredName ?? '', companyEmail: record.companyEmail ?? '', workPhone: record.workPhone ?? '', startDate: record.startDate ?? '', employmentType: 'full_time', contractType: 'permanent' }} onSubmit={async (values) => { await update.mutateAsync(values) }} /></Modal>
    <Modal open={offboarding} title="Record employee exit" onClose={closeOffboarding}><OffboardingPanel submitting={offboard.isPending} onSubmit={async (values) => { await offboard.mutateAsync(values) }} /></Modal>
    <Modal open={archiving} title="Archive employee" onClose={closeArchiving}><p>Archive this employee only for duplicate or invalid records. Employment exits should use Record exit.</p><Input label="Archive reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} error={archiveError} /><div className="oh-form-actions"><Button variant="danger" loading={archive.isPending} onClick={() => { const parsed = archiveEmployeeSchema.safeParse({ reason: archiveReason }); if (!parsed.success) { setArchiveError(parsed.error.issues[0]?.message ?? 'A reason is required.'); return } setArchiveError(''); void archive.mutateAsync(parsed.data.reason) }}>Archive</Button></div>{archive.isError ? <FormError>Employee could not be archived.</FormError> : null}</Modal>
  </section>
}
