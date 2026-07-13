import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { OverviewTab } from './pages/OverviewTab'
import { ProjectDetailsTab } from './pages/ProjectDetailsTab'
import { DailyUpdatesTab } from './pages/DailyUpdatesTab'
import { MissedUpdatesTab } from './pages/MissedUpdatesTab'
import { useAuth } from '../auth/AuthProvider'
import { Layout, ClipboardList, AlertCircle } from 'lucide-react'

export default function TrackerPage() {
  const { access } = useAuth()
  const { pathname } = useLocation()
  const permissions = access?.permissionKeys || []
  const hasReadAll = permissions.includes('daily_updates.read_all')

  const tabs = [
    { to: '/tracker/overview', label: 'Overview', icon: Layout },
    { to: '/tracker/daily-updates', label: 'Daily Updates', icon: ClipboardList }
  ]

  if (hasReadAll) {
    tabs.push({ to: '/tracker/missed-updates', label: 'Missed Updates', icon: AlertCircle })
  }

  return (
    <section className="oh-workspace-page">
      {/* Tab Navigation header */}
      <nav className="oh-portal-tabs" aria-label="Projects sections" style={{ marginBottom: 'var(--space-6)' }}>
        {tabs.map((tab) => {
          const active =
            pathname === tab.to ||
            pathname.startsWith(`${tab.to}/`) ||
            (tab.to === '/tracker/overview' && pathname.startsWith('/tracker/projects/'))

          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`oh-portal-tab${active ? ' oh-portal-tab--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            >
              <tab.icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Routes Switch */}
      <Routes>
        <Route index element={<Navigate to="/tracker/overview" replace />} />
        <Route path="overview" element={<OverviewTab />} />
        <Route path="projects/:projectId" element={<ProjectDetailsTab />} />
        <Route path="daily-updates" element={<DailyUpdatesTab />} />
        {hasReadAll && <Route path="missed-updates" element={<MissedUpdatesTab />} />}
        <Route path="*" element={<Navigate to="/tracker/overview" replace />} />
      </Routes>
    </section>
  )
}
