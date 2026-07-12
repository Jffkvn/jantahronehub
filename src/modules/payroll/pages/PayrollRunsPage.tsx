import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CalendarPlus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { payrollApi, type PayrollApi } from '../api/payroll'
import type { PayrollDraftItem, PayrollRun } from '../types'

const money=(value:number)=>new Intl.NumberFormat('en-UG',{style:'currency',currency:'UGX',maximumFractionDigits:0}).format(value)
export function PayrollRunsPage({api=payrollApi,permissions=[]}:{api?:PayrollApi;permissions?:string[]}){
  const query=useQuery({queryKey:['payroll-runs'],queryFn:api.list}), employees=useQuery({queryKey:['payroll-employees'],queryFn:api.eligibleEmployees,enabled:permissions.includes('payroll.prepare')})
  const client=useQueryClient(),navigate=useNavigate(); const [creating,setCreating]=useState(false),[period,setPeriod]=useState(new Date().toISOString().slice(0,7)),[selected,setSelected]=useState<string[]>([])
  const create=useMutation({mutationFn:()=>{const items:PayrollDraftItem[]=(employees.data??[]).filter((e)=>selected.includes(e.id)).map((e)=>({employeeId:e.id,percentOfMonthWorked:e.defaultPercentWorked,overtimeHours:0,lineItems:[]}));return api.create(`${period}-01`,items)},onSuccess:async(id)=>{await client.invalidateQueries({queryKey:['payroll-runs']});navigate(`/hr/payroll/${id}`)}})
  const columns=[{key:'period',header:'Payroll',render:(run:PayrollRun)=><div className="oh-person-cell"><strong>{run.periodLabel}</strong><span>Run {run.runNumber} · {run.runType}</span></div>},{key:'status',header:'Status',render:(run:PayrollRun)=><StatusBadge tone={run.status==='approved'?'success':'warning'}>{run.status}</StatusBadge>},{key:'gross',header:'Gross',render:(run:PayrollRun)=>money(run.totalGross)},{key:'net',header:'Net pay',render:(run:PayrollRun)=>money(run.totalNet)},{key:'payment',header:'Payment',render:(run:PayrollRun)=>run.payment?<StatusBadge tone="success">Paid</StatusBadge>:<span>Not recorded</span>},{key:'action',header:'',render:(run:PayrollRun)=><Link className="oh-text-link" to={`/hr/payroll/${run.id}`}>Open run</Link>}]
  return <section className="oh-workspace-page"><header className="oh-page-header"><div><p>Payroll operations</p><h1>Payroll runs</h1><span>Prepare, approve, export and record payment without changing approved history.</span></div>{permissions.includes('payroll.prepare')&&<Button onClick={()=>{setSelected((employees.data??[]).map((e)=>e.id));setCreating(true)}}><Plus size={17}/>New payroll</Button>}</header>
    {query.isLoading?<p role="status">Loading payroll…</p>:query.isError?<EmptyState icon={<Banknote/>} title="Payroll could not be loaded" description="Try again or contact the administrator."/>:<DataTable caption="Payroll runs" columns={columns} rows={query.data??[]} rowKey={(r)=>r.id} emptyMessage="No payroll runs yet."/>}
    <Modal open={creating} title="Create regular payroll" onClose={()=>setCreating(false)}><form className="oh-form-stack" onSubmit={(e)=>{e.preventDefault();create.mutate()}}><label>Payroll month<input type="month" value={period} onChange={(e)=>setPeriod(e.target.value)} required/></label><fieldset><legend>Employees</legend><div className="payroll-employee-picker">{(employees.data??[]).map((employee)=><label key={employee.id}><input type="checkbox" checked={selected.includes(employee.id)} onChange={(e)=>setSelected((current)=>e.target.checked?[...current,employee.id]:current.filter((id)=>id!==employee.id))}/><span>{employee.employeeName}<small>{employee.employeeNumber}</small></span></label>)}</div></fieldset>{create.isError&&<p className="oh-form-error">Payroll could not be created.</p>}<Button type="submit" disabled={!selected.length||create.isPending}><CalendarPlus size={17}/>Create draft</Button></form></Modal>
  </section>
}
