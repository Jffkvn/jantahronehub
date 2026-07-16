import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Boxes, ClipboardList, PackageCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { projectSummariesApi } from '../api/projectSummaries'

const money = new Intl.NumberFormat('en-UG', {
  style: 'currency', currency: 'UGX', maximumFractionDigits: 0,
})

export function ProjectInventoryTab({ projectId, compact = false }: { projectId: string; compact?: boolean }) {
  const query = useQuery({
    queryKey: ['projects', projectId, 'inventory-summary'],
    queryFn: () => projectSummariesApi.inventory(projectId),
  })
  if (query.isLoading) return <div className="oh-card" role="status">Loading project inventory…</div>
  if (query.isError) return <div className="oh-card"><p>Project inventory could not be loaded.</p><button className="oh-button oh-button--secondary" type="button" onClick={() => void query.refetch()}>Try again</button></div>
  const inventory = query.data
  if (!inventory) return null
  return (
    <section className="oh-card oh-project-ledger-panel">
      <div className="oh-team-section-header">
        <div><h3>Inventory reconciliation</h3><p>Calculated from canonical requests, issues and custody.</p></div>
        <Link to={`/inventory/requests?project=${projectId}`}>Open Inventory <ArrowRight size={15} /></Link>
      </div>
      <div className="oh-project-ledger-metrics">
        <div><ClipboardList size={17} /><span>Pending requests</span><strong>{inventory.pendingRequestCount}</strong></div>
        <div><PackageCheck size={17} /><span>Issued value</span><strong>{money.format(inventory.issuedEstimatedValue)}</strong></div>
        <div><Boxes size={17} /><span>Active custody</span><strong>{inventory.activeEquipmentCustodyCount}</strong></div>
        <div><span>Issued consumables</span><strong>{inventory.issuedConsumableQuantity}</strong></div>
      </div>
      {!compact && (inventory.overdueReturnCount || inventory.damagedOrLostReturnCount || inventory.unresolvedLegacyLinkCount) ? (
        <p className="oh-ledger-warning"><AlertTriangle size={16} /> {inventory.overdueReturnCount} overdue return(s); {inventory.damagedOrLostReturnCount} damaged/lost return(s); {inventory.unresolvedLegacyLinkCount} legacy link(s) need reconciliation.</p>
      ) : null}
    </section>
  )
}
