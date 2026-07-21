import { useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { getVisibleModules, oneHubModules, type UserRole } from '../config/modules'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

interface AppShellProps {
  currentUser: {
    name: string
    email: string
    role: UserRole
  }
  enabledModules: readonly string[]
  accessibleModules?: readonly string[]
  onSignOut?: () => void
}

export function AppShell({
  currentUser,
  enabledModules,
  accessibleModules,
  onSignOut,
}: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const visibleModules = useMemo(() => {
    if (!accessibleModules) {
      return getVisibleModules(currentUser.role, enabledModules)
    }

    const enabled = new Set(enabledModules)
    const accessible = new Set(accessibleModules)
    return oneHubModules.filter(
      (module) => enabled.has(module.key) && accessible.has(module.key),
    )
  }, [accessibleModules, currentUser.role, enabledModules])
  const activeModule = visibleModules.find((module) =>
    location.pathname.startsWith(module.path),
  )

  return (
    <div className={`oh-app-shell${sidebarCollapsed ? ' oh-app-shell--collapsed' : ''}`}>
      <a className="oh-skip-link" href="#main-content">Skip to main content</a>
      <Sidebar
        modules={visibleModules}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileMenuOpen}
        onCollapse={() => setSidebarCollapsed((current) => !current)}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onSignOut={onSignOut}
      />
      <div className="oh-app-shell__workspace">
        <Topbar
          pageTitle={activeModule?.label ?? 'OneHub Overview'}
          currentUser={currentUser}
          mobileMenuOpen={mobileMenuOpen}
          onOpenNavigation={() => setMobileMenuOpen(true)}
        />
        <main className="oh-app-shell__main" id="main-content">
          <div className="oh-app-shell__content">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileNav modules={visibleModules} onMore={() => setMobileMenuOpen(true)} />
    </div>
  )
}
