import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, Banknote, CalendarPlus, CircleDollarSign, Clock3, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../../components/ui/Button'
import { DataTable } from '../../../components/ui/DataTable'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Modal } from '../../../components/ui/Modal'
import { StatusBadge } from '../../../components/ui/StatusBadge'
import { Input } from '../../../components/ui/Input'
import { MetricCard } from '../../../components/ui/MetricCard'
import { payrollApi, type PayrollApi } from '../api/payroll'
import type { PayrollDraftItem, PayrollRun } from '../types'

const money=(value:number)=>new Intl.NumberFormat('en-UG',{style:'currency',currency:'UGX',maximumFractionDigits:0}).format(value)
export function PayrollRunsPage({api=payrollApi,permissions=[]}:{api?:PayrollApi;permissions?:string[]}){
  const query=useQuery({queryKey:['payroll-runs'],queryFn:api.list}), employees=useQuery({queryKey:['payroll-employees'],queryFn:api.eligibleEmployees,enabled:permissions.includes('payroll.prepare')})
  const client=useQueryClient(),navigate=useNavigate(); const [creating,setCreating]=useState(false),[period,setPeriod]=useState(new Date().toISOString().slice(0,7)),[selected,setSelected]=useState<string[]>([])
  const create=useMutation({mutationFn:()=>{const items:PayrollDraftItem[]=(employees.data??[]).filter((e)=>selected.includes(e.id)).map((e)=>({employeeId:e.id,percentOfMonthWorked:e.defaultPercentWorked,overtimeHours:0,lineItems:[]}));return api.create(`${period}-01`,items)},onSuccess:async(id)=>{await client.invalidateQueries({queryKey:['payroll-runs']});navigate(`/hr/payroll/${id}`)}})
  const runs=query.data??[], approvedRuns=runs.filter((run)=>run.status==='approved'), paidRuns=runs.filter((run)=>run.payment), latestRun=runs[0]
  const columns=[{key:'period',header:'Payroll',render:(run:PayrollRun)=><div className="oh-person-cell"><strong>{run.periodLabel}</strong><span>Run {run.runNumber} · {run.runType}</span></div>},{key:'status',header:'Status',render:(run:PayrollRun)=><StatusBadge tone={run.status==='approved'?'success':'warning'}>{run.status}</StatusBadge>},{key:'gross',header:'Gross',render:(run:PayrollRun)=>money(run.totalGross)},{key:'net',header:'Net pay',render:(run:PayrollRun)=>money(run.totalNet)},{key:'payment',header:'Payment',render:(run:PayrollRun)=>run.payment?<StatusBadge tone="success">Paid</StatusBadge>:<span>Not recorded</span>},{key:'action',header:'',render:(run:PayrollRun)=><Link className="oh-text-link" to={`/hr/payroll/${run.id}`}>Open run</Link>}]
  return <section className="oh-workspace-page"><header className="oh-page-header"><div><p>Payroll operations</p><h1>Payroll runs</h1><span>Prepare, approve, export and record payment without changing approved history.</span></div>{permissions.includes('payroll.prepare')&&<Button onClick={()=>{setSelected((employees.data??[]).map((e)=>e.id));setCreating(true)}}><Plus size={17}/>New payroll</Button>}</header>
    <section className="oh-payroll-metrics" aria-label="Payroll summary">
      <MetricCard label="Payroll runs" value={runs.length} detail={`${approvedRuns.length} approved`} icon={<CalendarPlus size={20}/>} tone="navy"/>
      <MetricCard label="Latest net pay" value={latestRun?money(latestRun.totalNet):money(0)} detail={latestRun?.periodLabel??'No payroll prepared'} icon={<CircleDollarSign size={20}/>} tone="emerald"/>
      <MetricCard label="Payments recorded" value={paidRuns.length} detail={`${Math.max(approvedRuns.length-paidRuns.length,0)} awaiting payment record`} icon={<BadgeCheck size={20}/>} tone="blue"/>
      <MetricCard label="Draft runs" value={runs.length-approvedRuns.length} detail="Still open for preparation" icon={<Clock3 size={20}/>} tone="amber"/>
    </section>
    {query.isLoading?<p role="status">Loading payroll…</p>:query.isError?<EmptyState icon={<Banknote/>} title="Payroll could not be loaded" description="Try again or contact the administrator."/>:<DataTable caption="Payroll runs" columns={columns} rows={query.data??[]} rowKey={(r)=>r.id} emptyMessage="No payroll runs yet."/>}
    <Modal open={creating} title="Create regular payroll" onClose={()=>setCreating(false)}><form className="oh-form-stack" onSubmit={(e)=>{e.preventDefault();create.mutate()}}><Input label="Payroll month" type="month" value={period} onChange={(e)=>setPeriod(e.target.value)} required/><fieldset><legend>Employees</legend><div className="payroll-employee-picker">{(employees.data??[]).length === 0 ? <p className="oh-picker-empty" style={{ padding: 'var(--space-4)', color: 'var(--color-text-muted)', textAlign: 'center', fontSize: '0.86rem' }}>No active employees found to add to payroll.</p> : (employees.data??[]).map((employee)=><label key={employee.id}><input type="checkbox" checked={selected.includes(employee.id)} onChange={(e)=>setSelected((current)=>e.target.checked?[...current,employee.id]:current.filter((id)=>id!==employee.id))}/><span>{employee.employeeName}<small>{employee.employeeNumber}</small></span></label>)}</div></fieldset>{create.isError&&<p className="oh-form-error">Payroll could not be created.</p>}<Button type="submit" disabled={!selected.length||create.isPending}><CalendarPlus size={17}/>Create draft</Button></form></Modal>
  </section>
}
