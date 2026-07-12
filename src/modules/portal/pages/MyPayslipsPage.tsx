import { FileDown } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import type { PayrollRun } from '../../payroll/types'
import type { SelfServiceApi } from '../api/selfService'
import { EmptyPayslipState, PortalHeader } from './shared'

export function MyPayslipsPage({ api, runs }: { api: SelfServiceApi; runs: PayrollRun[] }) {
  return (
    <>
      <PortalHeader
        eyebrow="Payroll"
        title="My Payslips"
        description="Download your approved payroll statements. Company-wide totals remain private."
      />
      {runs.length ? <div className="oh-portal-grid">{runs.map((run)=>{const item=run.items[0];return <article key={`${run.id}-${item.id}`} className="oh-portal-card"><div><span>{run.runType} payroll</span><h3>{run.periodLabel}</h3><p>Net pay: {new Intl.NumberFormat('en-UG',{style:'currency',currency:'UGX',maximumFractionDigits:0}).format(item.netPay)}</p></div><Button variant="secondary" onClick={()=>void api.downloadPayslip(run)}><FileDown size={16}/>Download PDF</Button></article>})}</div> : <EmptyPayslipState />}
    </>
  )
}
