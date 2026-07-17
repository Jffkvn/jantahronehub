import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Banknote, ReceiptText, Undo2, WalletCards } from 'lucide-react'
import { Link } from 'react-router-dom'

import { projectSummariesApi } from '../api/projectSummaries'

const money = new Intl.NumberFormat('en-UG', {
  style: 'currency',
  currency: 'UGX',
  maximumFractionDigits: 0,
})

export function ProjectCashTab({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const query = useQuery({
    queryKey: ['projects', projectId, 'cash-summary'],
    queryFn: () => projectSummariesApi.cash(projectId),
  })
  if (query.isLoading) return <div className="oh-card" role="status">Loading project cash…</div>
  if (query.isError) return <div className="oh-card"><p>Project cash could not be loaded.</p><button className="oh-button oh-button--secondary" type="button" onClick={() => void query.refetch()}>Try again</button></div>
  const cash = query.data
  if (!cash) return null
  return (
    <section className="oh-card oh-project-ledger-panel">
      <div className="oh-team-section-header"><div><h3>Cash reconciliation</h3><p>Calculated from the canonical Cash ledger.</p></div><Link to={`/cash?project=${projectId}`}>Open Cash <ArrowRight size={15} /></Link></div>
      <div className="oh-project-ledger-metrics">
        <div><Banknote size={17} /><span>Disbursed</span><strong>{money.format(cash.disbursed)}</strong></div>
        <div><ReceiptText size={17} /><span>Accepted expenses</span><strong>{money.format(cash.acceptedExpenses)}</strong></div>
        <div><Undo2 size={17} /><span>Returned</span><strong>{money.format(cash.returnedCash)}</strong></div>
        <div><WalletCards size={17} /><span>Outstanding</span><strong>{money.format(cash.outstandingBalance)}</strong></div>
      </div>
      {!compact && (cash.pendingAccountabilityCount || cash.receiptExceptionCount) ? (
        <p className="oh-ledger-warning"><AlertTriangle size={16} /> {cash.pendingAccountabilityCount} pending accountability item(s); {cash.receiptExceptionCount} receipt exception(s).</p>
      ) : null}
    </section>
  )
}
