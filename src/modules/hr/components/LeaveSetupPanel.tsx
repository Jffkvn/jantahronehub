import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '../../../components/ui/Button'
import { FormError } from '../../../components/ui/FormError'
import { Input } from '../../../components/ui/Input'
import type { EmployeeSummary } from '../api/employees'
import type { LeaveApi, LeaveType } from '../api/leave'

const year = new Date().getFullYear()

export function LeaveSetupPanel({ api, types, employees }: { api: LeaveApi; types: LeaveType[]; employees: EmployeeSummary[] }) {
  const queryClient = useQueryClient()
  const [type, setType] = useState({ code: '', name: '', days: '', paid: true, evidence: false })
  const [holiday, setHoliday] = useState({ date: '', name: '' })
  const [entitlement, setEntitlementForm] = useState({ employeeId: employees[0]?.id ?? '', leaveTypeId: types[0]?.id ?? '', year: String(year), days: '' })
  const [adjustment, setAdjustment] = useState({ employeeId: employees[0]?.id ?? '', leaveTypeId: types[0]?.id ?? '', year: String(year), days: '', reason: '' })
  const holidays = useQuery({ queryKey: ['leave-holidays'], queryFn: () => api.listHolidays?.() ?? Promise.resolve([]) })
  const saveType = useMutation({ mutationFn: () => api.saveType!({ code: type.code, name: type.name, isPaid: type.paid, defaultEntitlementDays: type.days === '' ? null : Number(type.days), requiresEvidence: type.evidence }), onSuccess: async () => { setType({ code: '', name: '', days: '', paid: true, evidence: false }); await queryClient.invalidateQueries({ queryKey: ['leave-types'] }) } })
  const saveHoliday = useMutation({ mutationFn: () => api.saveHoliday!({ date: holiday.date, name: holiday.name }), onSuccess: async () => { setHoliday({ date: '', name: '' }); await queryClient.invalidateQueries({ queryKey: ['leave-holidays'] }) } })
  const setEntitlement = useMutation({ mutationFn: () => api.setEntitlement!({ employeeId: entitlement.employeeId, leaveTypeId: entitlement.leaveTypeId, year: Number(entitlement.year), days: Number(entitlement.days) }) })
  const adjust = useMutation({ mutationFn: () => api.adjustBalance({ employeeId: adjustment.employeeId, leaveTypeId: adjustment.leaveTypeId, leaveYear: Number(adjustment.year), adjustmentDays: Number(adjustment.days), reason: adjustment.reason }) })
  const error = saveType.error ?? saveHoliday.error ?? setEntitlement.error ?? adjust.error

  return <div className="oh-form-stack">
    <section className="oh-card"><h2>Leave types</h2><div className="oh-form-grid"><Input label="Type name" value={type.name} onChange={(event) => setType({ ...type, name: event.target.value })} /><Input label="Code" value={type.code} onChange={(event) => setType({ ...type, code: event.target.value })} /><Input label="Default days" type="number" min="0" value={type.days} onChange={(event) => setType({ ...type, days: event.target.value })} /><label className="oh-checkbox"><input type="checkbox" checked={type.paid} onChange={(event) => setType({ ...type, paid: event.target.checked })} /> Paid leave</label><label className="oh-checkbox"><input type="checkbox" checked={type.evidence} onChange={(event) => setType({ ...type, evidence: event.target.checked })} /> Evidence required</label></div><Button disabled={!api.saveType || type.name.trim().length < 2 || type.code.trim().length < 2} loading={saveType.isPending} onClick={() => saveType.mutate()}>Save leave type</Button></section>
    <section className="oh-card"><h2>Public holidays</h2><div className="oh-form-grid"><Input label="Holiday date" type="date" value={holiday.date} onChange={(event) => setHoliday({ ...holiday, date: event.target.value })} /><Input label="Holiday name" value={holiday.name} onChange={(event) => setHoliday({ ...holiday, name: event.target.value })} /></div><Button disabled={!api.saveHoliday || !holiday.date || holiday.name.trim().length < 2} loading={saveHoliday.isPending} onClick={() => saveHoliday.mutate()}>Save holiday</Button>{holidays.data?.length ? <ul>{holidays.data.map((item) => <li key={item.id}>{item.date} · {item.name}</li>)}</ul> : <p>No public holidays configured.</p>}</section>
    <section className="oh-card"><h2>Employee entitlement</h2><SetupAssignment value={entitlement} onChange={setEntitlementForm} employees={employees} types={types} /><Button disabled={!api.setEntitlement || !entitlement.employeeId || !entitlement.leaveTypeId || entitlement.days === ''} loading={setEntitlement.isPending} onClick={() => setEntitlement.mutate()}>Save entitlement</Button></section>
    <section className="oh-card"><h2>Balance adjustment</h2><SetupAssignment value={adjustment} onChange={setAdjustment} employees={employees} types={types} /><Input label="Adjustment reason" value={adjustment.reason} onChange={(event) => setAdjustment({ ...adjustment, reason: event.target.value })} /><Button disabled={!adjustment.employeeId || !adjustment.leaveTypeId || Number(adjustment.days) === 0 || adjustment.reason.trim().length < 3} loading={adjust.isPending} onClick={() => adjust.mutate()}>Record adjustment</Button></section>
    {error ? <FormError>{error.message}</FormError> : null}
  </div>
}

function SetupAssignment<T extends { employeeId: string; leaveTypeId: string; year: string; days: string }>({ value, onChange, employees, types }: { value: T; onChange: (value: T) => void; employees: EmployeeSummary[]; types: LeaveType[] }) {
  return <div className="oh-form-grid"><label className="oh-field"><span className="oh-field__label">Employee</span><select className="oh-select" value={value.employeeId} onChange={(event) => onChange({ ...value, employeeId: event.target.value })}>{employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.legalName} · {employee.employeeNumber}</option>)}</select></label><label className="oh-field"><span className="oh-field__label">Leave type</span><select className="oh-select" value={value.leaveTypeId} onChange={(event) => onChange({ ...value, leaveTypeId: event.target.value })}>{types.map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label><Input label="Leave year" type="number" value={value.year} onChange={(event) => onChange({ ...value, year: event.target.value })} /><Input label="Days" type="number" step="1" value={value.days} onChange={(event) => onChange({ ...value, days: event.target.value })} /></div>
}
