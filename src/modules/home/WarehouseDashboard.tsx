import { useQuery } from '@tanstack/react-query'
import { Boxes, ClipboardClock, PackageCheck, Wrench } from 'lucide-react'

import { DonutChart } from '../../components/charts/DonutChart'
import { ActivityList } from '../../components/ui/ActivityList'
import { MetricCard } from '../../components/ui/MetricCard'
import { Panel } from '../../components/ui/Panel'
import type { ModuleKey } from '../../config/modules'
import { inventoryApi } from '../warehouse/api/inventory'
import { DashboardHeader } from './DashboardHeader'
import { DashboardQuickActions, DashboardState, formatDashboardDate, groupCounts } from './RoleDashboard'

export function WarehouseDashboard({ displayName, enabledModules }: { displayName: string; enabledModules: readonly ModuleKey[] }) {
  const dashboard = useQuery({
    queryKey: ['dashboard', 'warehouse'],
    queryFn: async () => {
      const [consumables, equipment, requests, movements] = await Promise.all([
        inventoryApi.listConsumables(), inventoryApi.listEquipment(), inventoryApi.listRequests(), inventoryApi.listMovements(),
      ])
      return { consumables, equipment, requests, movements }
    },
  })
  if (dashboard.isPending) return <DashboardState>Preparing the warehouse overview…</DashboardState>
  if (dashboard.isError) return <DashboardState tone="error">The warehouse overview could not be loaded. Inventory workflows remain available from the navigation.</DashboardState>

  const { consumables, equipment, requests, movements } = dashboard.data
  const pending = requests.filter((request) => request.status === 'pending_approval' || request.status === 'approved')
  const availableAssets = equipment.filter((asset) => asset.status === 'available').length

  return (
    <div className="oh-role-dashboard">
      <DashboardHeader displayName={displayName} eyebrow="HQ warehouse operations" title="Warehouse workspace" description="Receive, safeguard and issue every material and serialized asset with a clear audit trail." />
      <section className="oh-role-dashboard__metrics" aria-label="Warehouse metrics">
        <MetricCard label="Consumable SKUs" value={consumables.length} detail="Item masters at HQ" icon={<Boxes size={20} />} to="/inventory/consumables" />
        <MetricCard label="Equipment assets" value={equipment.length} detail={`${availableAssets} available`} icon={<Wrench size={20} />} tone="navy" to="/inventory/equipment" />
        <MetricCard label="Pending requests" value={pending.length} detail="Awaiting approval or fulfilment" icon={<ClipboardClock size={20} />} tone="amber" to="/inventory/requests" />
        <MetricCard label="Ledger movements" value={movements.length} detail="Auditable stock entries" icon={<PackageCheck size={20} />} tone="blue" to="/inventory/history" />
      </section>
      <section className="oh-role-dashboard__grid">
        <DonutChart title="Request pipeline" summary="Project stock requests by current status." data={groupCounts(requests.map((request) => request.status))} />
        <DonutChart title="Equipment availability" summary="Serialized assets grouped by custody status." data={groupCounts(equipment.map((asset) => asset.status))} />
      </section>
      <section className="oh-role-dashboard__grid oh-role-dashboard__grid--support">
        <Panel title="Recent stock movements" description="Latest receipts, issues, returns and adjustments.">
          <ActivityList items={movements.slice(0, 5).map((movement) => ({ id: movement.id, title: movement.consumable_items?.name || movement.equipment_assets?.model_name || 'Inventory item', detail: `${movement.movement_type.replaceAll('_', ' ')} · Qty ${movement.quantity}`, timestamp: formatDashboardDate(movement.created_at), to: '/inventory/history' }))} emptyMessage="No stock movements have been recorded." />
        </Panel>
        <Panel title="Warehouse quick actions" description="Receive and fulfil stock without extra navigation."><DashboardQuickActions kind="warehouse" enabledModules={enabledModules} /></Panel>
      </section>
    </div>
  )
}
