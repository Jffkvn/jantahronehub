import { useMemo, useState } from 'react'

import { Button } from '../../../components/ui/Button'
import type { HrStaffAdvanceInput, StaffAdvanceRequestInput } from '../schemas/staffAdvances'

interface EmployeeOption { id: string; name: string }
type AdvanceFormValue = StaffAdvanceRequestInput & { employeeId?: string; dateIssued?: string; notes?: string }

function today() { return new Date().toISOString().slice(0, 10) }
function nextMonth() { const date = new Date(); date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + 1); return date.toISOString().slice(0, 10) }

export function StaffAdvanceForm({ employeeOptions, submitting, onCancel, onSubmit }: { employeeOptions?: EmployeeOption[]; submitting?: boolean; onCancel(): void; onSubmit(value: AdvanceFormValue): Promise<unknown> }) {
  const direct = Boolean(employeeOptions)
  const defaults = useMemo(() => ({ amount: '', reason: '', instalments: '1', deductionStartMonth: nextMonth(), employeeId: '', dateIssued: today(), notes: '' }), [])
  const [form, setForm] = useState(defaults)
  return <form className="oh-form" onSubmit={(event) => { event.preventDefault(); void onSubmit({ amount: Number(form.amount), reason: form.reason, instalments: Number(form.instalments), deductionStartMonth: form.deductionStartMonth, ...(direct ? { employeeId: form.employeeId, dateIssued: form.dateIssued, notes: form.notes } : {}) }) }}>
    {direct ? <label className="oh-field"><span className="oh-field__label">Employee</span><select className="oh-input" aria-label="Employee" required value={form.employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}><option value="">Select employee…</option>{employeeOptions?.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label> : null}
    <div className="oh-form-grid">
      <label className="oh-field"><span className="oh-field__label">Advance amount (UGX)</span><input className="oh-input" type="number" min="1" required value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label className="oh-field"><span className="oh-field__label">Number of instalments</span><input className="oh-input" type="number" min="1" max="60" required value={form.instalments} onChange={(event) => setForm({ ...form, instalments: event.target.value })} /></label>
      {direct ? <label className="oh-field"><span className="oh-field__label">Date issued</span><input className="oh-input" type="date" required value={form.dateIssued} onChange={(event) => setForm({ ...form, dateIssued: event.target.value })} /></label> : null}
      <label className="oh-field"><span className="oh-field__label">Deduction start month</span><input className="oh-input" type="date" required value={form.deductionStartMonth} onChange={(event) => setForm({ ...form, deductionStartMonth: event.target.value })} /></label>
    </div>
    <label className="oh-field"><span className="oh-field__label">Reason</span><textarea className="oh-input oh-textarea" required minLength={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
    {direct ? <label className="oh-field"><span className="oh-field__label">Internal notes</span><textarea className="oh-input oh-textarea" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label> : null}
    <div className="oh-form-actions"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={submitting}>{direct ? 'Log advance' : 'Submit request'}</Button></div>
  </form>
}

export type { HrStaffAdvanceInput }
