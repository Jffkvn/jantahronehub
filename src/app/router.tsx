import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { oneHubModules } from '../config/modules'
import { AppShell } from '../layout/AppShell'

const ComponentShowcase = lazy(() =>
  import('./ComponentShowcase').then((module) => ({ default: module.ComponentShowcase })),
)
const HomePage = lazy(() => import('../modules/home/HomePage'))
const PortalPage = lazy(() => import('../modules/portal/PortalPage'))
const HrPage = lazy(() => import('../modules/hr/HrPage'))
const WarehousePage = lazy(() => import('../modules/warehouse/WarehousePage'))
const CashPage = lazy(() => import('../modules/cash/CashPage'))
const TrackerPage = lazy(() => import('../modules/projects/TrackerPage'))
const ReportsPage = lazy(() => import('../modules/reports/ReportsPage'))
const AdminPage = lazy(() => import('../modules/admin/AdminPage'))

const enabledModules = oneHubModules.map((module) => module.key)

function LoginEntry() {
  return (
    <main className="oh-login">
      <section className="oh-login__panel" aria-labelledby="product-name">
        <p className="oh-login__eyebrow">Welcome to</p>
        <h1 id="product-name">Egypro OneHub</h1>
        <p className="oh-login__provider">Powered by JantaHR</p>
      </section>
    </main>
  )
}

function RouteLoading() {
  return (
    <div className="oh-route-loading" role="status">
      <span />
      <p>Opening workspace…</p>
    </div>
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<LoginEntry />} />
        <Route path="/components" element={<ComponentShowcase />} />
        <Route
          element={
            <AppShell
              currentUser={{
                name: 'Jeff Adhaya',
                email: 'support@jantahr.com',
                role: 'super_admin',
              }}
              enabledModules={enabledModules}
              onSignOut={() => window.location.assign('/login')}
            />
          }
        >
          <Route path="/home" element={<HomePage />} />
          <Route path="/my" element={<PortalPage />} />
          <Route path="/hr/*" element={<HrPage />} />
          <Route path="/inventory/*" element={<WarehousePage />} />
          <Route path="/cash/*" element={<CashPage />} />
          <Route path="/tracker/*" element={<TrackerPage />} />
          <Route path="/reports/*" element={<ReportsPage />} />
          <Route path="/admin/*" element={<AdminPage />} />
        </Route>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </Suspense>
  )
}
