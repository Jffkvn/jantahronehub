import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { CashAdvancesPage } from './pages/CashAdvancesPage'
import { AdvanceDetailPage } from './pages/AdvanceDetailPage'
import { Landmark } from 'lucide-react'

export default function CashPage() {
  return (
    <section className="oh-workspace-page">
      <nav className="oh-portal-tabs" aria-label="Project Cash sections" style={{ marginBottom: 'var(--space-6)' }}>
        <NavLink
          to="/cash/advances"
          className={({ isActive }) =>
            isActive ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'
          }
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Landmark size={16} aria-hidden="true" />
          <span>Advances Ledger</span>
        </NavLink>
      </nav>

      <Routes>
        <Route index element={<Navigate to="/cash/advances" replace />} />
        <Route path="advances" element={<CashAdvancesPage />} />
        <Route path="advances/:advanceId" element={<AdvanceDetailPage />} />
        <Route path="*" element={<Navigate to="/cash/advances" replace />} />
      </Routes>
    </section>
  )
}
