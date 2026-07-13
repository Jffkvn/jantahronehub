import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { OverviewPage } from './pages/OverviewPage'
import { ConsumablesPage } from './pages/ConsumablesPage'
import { EquipmentPage } from './pages/EquipmentPage'
import { RequestsPage } from './pages/RequestsPage'
import { RequestDetailPage } from './pages/RequestDetailPage'
import { HistoryPage } from './pages/HistoryPage'
import { BulkToolsPage } from './pages/BulkToolsPage'
import { Layout, Package, Wrench, ClipboardList, History, FileSpreadsheet } from 'lucide-react'

export default function WarehousePage() {
  const tabs = [
    { to: '/inventory/overview', label: 'Overview', icon: Layout },
    { to: '/inventory/consumables', label: 'Consumables', icon: Package },
    { to: '/inventory/equipment', label: 'Equipment', icon: Wrench },
    { to: '/inventory/requests', label: 'Requests', icon: ClipboardList },
    { to: '/inventory/history', label: 'Ledger History', icon: History },
    { to: '/inventory/bulk-tools', label: 'Bulk Tools', icon: FileSpreadsheet }
  ]

  return (
    <section className="oh-workspace-page">
      {/* Tab Navigation header */}
      <nav className="oh-portal-tabs" aria-label="Inventory sections" style={{ marginBottom: 'var(--space-6)' }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              isActive ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'
            }
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <tab.icon size={16} aria-hidden="true" />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Routes Switch */}
      <Routes>
        <Route index element={<Navigate to="/inventory/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="consumables" element={<ConsumablesPage />} />
        <Route path="equipment" element={<EquipmentPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="requests/:requestId" element={<RequestDetailPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="bulk-tools" element={<BulkToolsPage />} />
        <Route path="*" element={<Navigate to="/inventory/overview" replace />} />
      </Routes>
    </section>
  )
}
