import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { OverviewTab } from './pages/OverviewTab'
import { ProjectDetailsTab } from './pages/ProjectDetailsTab'
import { DailyUpdatesTab } from './pages/DailyUpdatesTab'
import { MissedUpdatesTab } from './pages/MissedUpdatesTab'
import { useAuth } from '../auth/AuthProvider'
import { Layout, ClipboardList, AlertCircle } from 'lucide-react'

export default function TrackerPage() {
  const { access } = useAuth()
  const permissions = access?.permissionKeys || []
  const hasReadAll = permissions.includes('daily_updates.read_all')

  const tabs = [
    { to: 'overview', label: 'Overview', icon: Layout },
    { to: 'daily-updates', label: 'Daily Updates', icon: ClipboardList }
  ]

  if (hasReadAll) {
    tabs.push({ to: 'missed-updates', label: 'Missed Updates', icon: AlertCircle })
  }

  return (
    <section className="oh-workspace-page">
      {/* Tab Navigation header */}
      <nav className="oh-portal-tabs" aria-label="Projects sections" style={{ marginBottom: 'var(--space-6)' }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              isActive ? 'oh-portal-tab oh-portal-tab--active' : 'oh-portal-tab'
            }
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Routes Switch */}
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<OverviewTab />} />
        <Route path="projects/:projectId" element={<ProjectDetailsTab />} />
        <Route path="daily-updates" element={<DailyUpdatesTab />} />
        {hasReadAll && <Route path="missed-updates" element={<MissedUpdatesTab />} />}
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </section>
  )
}
