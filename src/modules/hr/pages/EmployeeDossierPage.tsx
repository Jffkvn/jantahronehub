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
  const setup = useQuery({ queryKey: ['employee-setup'], queryFn: api.setup })
  const offboard = useMutation({ mutationFn: (values: OffboardingValues) => api.offboard(employeeId, values), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); setOffboarding(false) } })
  const update = useMutation({ mutationFn: (values: EmployeeFormValues) => api.update(employeeId, values), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); setEditing(false) } })
  const archive = useMutation({ mutationFn: (reason: string) => api.archive(employeeId, reason), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['employees'] }); navigate('/hr/employees') } })

  if (employee.isLoading) return <p role="status">Opening employee dossier…</p>
  if (employee.isError || !employee.data) return <section className="oh-workspace-page"><h1>Employee unavailable</h1><Link to="/hr/employees">Return to directory</Link></section>
  const record = employee.data

  return <section className="oh-workspace-page">
    <Link className="oh-back-link" to="/hr/employees"><ArrowLeft size={16} /> Employee directory</Link>
    <header className="oh-dossier-header"><div className="oh-avatar"><UserRound aria-hidden="true" /></div><div><p>{record.employeeNumber}</p><h1>{record.legalName}</h1><div className="oh-dossier-meta"><StatusBadge tone={record.active ? 'success' : 'neutral'}>{record.active ? 'Active' : 'Inactive'}</StatusBadge><span>{record.jobTitleName ?? 'Role not assigned'}</span><span>{record.departmentName ?? 'Department not assigned'}</span></div></div><div className="oh-dossier-actions"><Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Edit employee</Button><Button variant="secondary" onClick={() => setOffboarding(true)}><CalendarClock size={16} /> Record exit</Button><Button variant="danger" onClick={() => setArchiving(true)}><Archive size={16} /> Archive employee</Button></div></header>
    <div className="oh-dossier-grid">
      <article className="oh-info-card"><h2>Personal & contact</h2><dl><div><dt><Mail size={16} /> Company email</dt><dd>{record.companyEmail ?? 'Not provided'}</dd></div><div><dt>Personal email</dt><dd>{record.personalEmail ?? 'Not provided'}</dd></div><div><dt><Phone size={16} /> Phone</dt><dd>{record.workPhone ?? 'Not provided'}</dd></div><div><dt>NIN / Passport</dt><dd>{record.nationalId ?? 'Not provided'}</dd></div></dl></article>
      <article className="oh-info-card"><h2>Current employment</h2><dl><div><dt>Start date</dt><dd>{record.startDate ?? 'Not recorded'}</dd></div><div><dt>Contract type</dt><dd>{record.contractType?.replace('_', ' ') ?? 'Not recorded'}</dd></div><div><dt>Contract / last day</dt><dd>{record.endDate ?? 'Open-ended'}</dd></div><div><dt>Probation</dt><dd>{record.probationStatus?.replace('_', ' ') ?? 'Not applicable'}</dd></div></dl></article>
      <article className="oh-info-card"><h2>Salary & payment</h2><dl><div><dt>Gross monthly salary</dt><dd>{record.grossSalary == null ? 'Not provided' : `UGX ${record.grossSalary.toLocaleString()}`}</dd></div><div><dt>Payment method</dt><dd>{record.paymentMethod?.replace('_',' ') ?? 'Cash'}</dd></div><div><dt>Mobile money</dt><dd>{record.mobileMoneyNumber ?? 'Not provided'}</dd></div><div><dt>Bank</dt><dd>{record.bankName ?? 'Not provided'}</dd></div><div><dt>Account number</dt><dd>{record.accountNumber ?? 'Not provided'}</dd></div></dl></article>
      <article className="oh-info-card"><h2>Statutory & payroll</h2><dl><div><dt>TIN number</dt><dd>{record.tinNumber ?? 'Not provided'}</dd></div><div><dt>NSSF number</dt><dd>{record.nssfNumber ?? 'Not provided'}</dd></div><div><dt>Employee tax type</dt><dd>{record.employeeTaxType ?? 'local'}</dd></div><div><dt>% of month worked</dt><dd>{record.pctMonthWorked ?? 100}%</dd></div></dl></article>
    </div>
    <Modal open={editing} title="Edit employee" onClose={closeEditing}><EmployeeForm departments={setup.data?.departments} jobTitles={setup.data?.jobTitles} submitting={update.isPending} initialValues={{ fullName: record.legalName, nationalId: record.nationalId ?? '', companyEmail: record.companyEmail ?? '', personalEmail: record.personalEmail ?? '', phone: record.workPhone ?? '', gender: (record.gender as EmployeeFormValues['gender']) ?? '', dateOfBirth: record.dateOfBirth ?? '', departmentId: record.departmentId ?? '', jobTitleId: record.jobTitleId ?? '', startDate: record.startDate ?? '', employmentType: record.employmentType ?? 'full_time', contractType: record.contractType ?? 'permanent', contractEndDate: record.contractEndDate ?? '', probationEndDate: record.probationEndDate ?? '', probationStatus: record.probationStatus ?? 'not_applicable', grossSalary: record.grossSalary?.toString() ?? '', currency: 'UGX', customOvertimeRate: record.customOvertimeRate?.toString() ?? '', paymentMethod: record.paymentMethod ?? 'cash', mobileMoneyNumber: record.mobileMoneyNumber ?? '', bankName: record.bankName ?? '', accountNumber: record.accountNumber ?? '', sortCode: record.sortCode ?? '', employeeNumber: record.employeeNumber, tinNumber: record.tinNumber ?? '', nssfNumber: record.nssfNumber ?? '', employeeTaxType: record.employeeTaxType ?? 'local', pctMonthWorked: record.pctMonthWorked?.toString() ?? '100', whtRate: record.whtRate?.toString() ?? '6' }} onSubmit={async (values) => { await update.mutateAsync(values) }} /></Modal>
    <Modal open={offboarding} title="Record employee exit" onClose={closeOffboarding}><OffboardingPanel submitting={offboard.isPending} onSubmit={async (values) => { await offboard.mutateAsync(values) }} /></Modal>
    <Modal open={archiving} title="Archive employee" onClose={closeArchiving}><p>Archive this employee only for duplicate or invalid records. Employment exits should use Record exit.</p><Input label="Archive reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} error={archiveError} /><div className="oh-form-actions"><Button variant="danger" loading={archive.isPending} onClick={() => { const parsed = archiveEmployeeSchema.safeParse({ reason: archiveReason }); if (!parsed.success) { setArchiveError(parsed.error.issues[0]?.message ?? 'A reason is required.'); return } setArchiveError(''); void archive.mutateAsync(parsed.data.reason) }}>Archive</Button></div>{archive.isError ? <FormError>Employee could not be archived.</FormError> : null}</Modal>
  </section>
}
