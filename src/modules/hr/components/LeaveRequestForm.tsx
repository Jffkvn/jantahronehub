import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import type { LeaveType } from '../api/leave'
import { leaveRequestInputSchema } from '../schemas/leave'

type FormInput = z.input<typeof leaveRequestInputSchema>
type FormOutput = z.output<typeof leaveRequestInputSchema>
export type LeaveRequestFormOutput = FormOutput & { files: File[] }

export function LeaveRequestForm({ leaveTypes, submitting, employeeOptions, onCancel, onSubmit, showDocuments = true, submitLabel = 'Submit leave request' }: {
  leaveTypes: LeaveType[]
  submitting?: boolean
  employeeOptions?: { id: string; name: string }[]
  onCancel?: () => void
  onSubmit: (values: LeaveRequestFormOutput & { employeeId?: string }) => Promise<void>
  showDocuments?: boolean
  submitLabel?: string
}) {
  const [files, setFiles] = useState<File[]>([])
  const [employeeId, setEmployeeId] = useState(employeeOptions?.[0]?.id ?? '')
  const [fileError, setFileError] = useState('')
  const { control, register, handleSubmit, formState: { errors } } = useForm<FormInput, unknown, FormOutput>({ resolver: zodResolver(leaveRequestInputSchema), defaultValues: { leaveTypeId: '', startDate: '', endDate: '', reason: '' } })
  const selectedLeaveTypeId = useWatch({ control, name: 'leaveTypeId' })
  const selectedType = leaveTypes.find((type) => type.id === selectedLeaveTypeId)
  const evidenceRequired = showDocuments && Boolean(selectedType?.requiresEvidence)

  return <form className="oh-form-stack" onSubmit={handleSubmit(async (values) => {
    if (evidenceRequired && files.length === 0) {
      setFileError('Supporting evidence is required for this leave type.')
      return
    }
    await onSubmit({ ...values, files, ...(employeeOptions ? { employeeId } : {}) }).catch(() => undefined)
  })}>
    {employeeOptions ? <label className="oh-field"><span className="oh-field__label">Employee <span className="oh-field__required">*</span></span><select className="oh-input" aria-label="Employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} required><option value="">Select employee…</option>{employeeOptions.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label> : null}
    <label className="oh-field"><span className="oh-field__label">Leave type <span className="oh-field__required">*</span></span><select className="oh-input" aria-label="Leave type" {...register('leaveTypeId')} required><option value="">Select leave type…</option>{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.defaultEntitlementDays === null ? '' : ` · ${type.defaultEntitlementDays} days`}</option>)}</select>{errors.leaveTypeId?.message ? <span className="oh-form-error">{errors.leaveTypeId.message}</span> : null}</label>
    <div className="oh-form-grid"><Input label="Start date" type="date" required error={errors.startDate?.message} {...register('startDate')} /><Input label="End date" type="date" required error={errors.endDate?.message} {...register('endDate')} /></div>
    <label className="oh-field"><span className="oh-field__label">Reason <span className="oh-field__required">*</span></span><textarea className="oh-input oh-textarea" aria-label="Reason" {...register('reason')} />{errors.reason?.message ? <span className="oh-form-error">{errors.reason.message}</span> : null}</label>
    {showDocuments ? <label className="oh-field"><span className="oh-field__label">Supporting documents {evidenceRequired ? <span className="oh-field__required">*</span> : null}</span><input className="oh-input" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif" aria-label="Supporting documents" onChange={(event) => { const selected = Array.from(event.target.files ?? []); if (selected.length > 10) { setFileError('Attach no more than 10 files.'); setFiles([]) } else { setFileError(''); setFiles(selected) } }} /><span className="oh-field__hint">{evidenceRequired ? 'Required' : 'Optional'} · up to 10 PDFs or phone-camera photos · 10 MB each.</span>{fileError ? <span className="oh-form-error">{fileError}</span> : null}</label> : null}
    {showDocuments && files.length ? <ul className="oh-leave-file-list">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul> : null}
    <div className="oh-form-actions">{onCancel ? <Button variant="secondary" onClick={onCancel}>Cancel</Button> : null}<Button type="submit" loading={submitting} disabled={Boolean(employeeOptions && !employeeId)}>{submitLabel}</Button></div>
  </form>
}
