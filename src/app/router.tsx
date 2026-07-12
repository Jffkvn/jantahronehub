import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { oneHubModules } from '../config/modules'
import { AppShell } from '../layout/AppShell'
import { useAuth } from '../modules/auth/AuthProvider'
import { InvitePage } from '../modules/auth/InvitePage'
import { LoginPage } from '../modules/auth/LoginPage'
import { RequireAuth } from '../modules/auth/RequireAuth'
import { TotpChallengePage } from '../modules/auth/TotpChallengePage'
import { TotpEnrollmentPage } from '../modules/auth/TotpEnrollmentPage'

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
const PayrollPreview = lazy(() => import('./PayrollPreview').then((module)=>({default:module.PayrollPreview})))

const previewModules = oneHubModules.map((module) => module.key)
const rolePriority = [
  'super_admin',
  'hr_admin',
  'cfo',
  'managing_director',
  'warehouse_manager',
  'project_manager',
  'coordinator',
  'employee',
] as const

function RouteLoading() {
  return (
    <div className="oh-route-loading" role="status">
      <span />
      <p>Opening workspace…</p>
    </div>
  )
}

function ForbiddenPage() {
  return (
    <main className="oh-auth-page">
      <section className="oh-auth-card">
        <p className="oh-auth-eyebrow">Access unavailable</p>
        <h1>We could not open this workspace</h1>
        <p className="oh-auth-description">
          Your account is inactive, unlinked, or does not have the required
          permission. Contact HR or the OneHub administrator.
        </p>
      </section>
    </main>
  )
}

function ProtectedShell() {
  const auth = useAuth()
  const access = auth.access
  if (!access?.profile) return <Navigate to="/forbidden" replace />
  const primaryRole =
    rolePriority.find((role) => access.roleKeys.includes(role)) ?? 'employee'
  const accessibleModules = oneHubModules
    .filter((module) => access.roleKeys.some((role) => module.roles.includes(role)))
    .map((module) => module.key)

  return (
    <AppShell
      currentUser={{
        name: access.profile.displayName,
        email: auth.session?.email ?? '',
        role: primaryRole,
      }}
      enabledModules={access.enabledModules}
      accessibleModules={accessibleModules}
      onSignOut={() => void auth.signOut()}
    />
  )
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/mfa/enroll" element={<TotpEnrollmentPage />} />
        <Route path="/mfa/challenge" element={<TotpChallengePage />} />
        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="/components" element={<ComponentShowcase />} />
        {import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? (
          <Route
            path="/components/shell"
            element={
              <AppShell
                currentUser={{
                  name: 'OneHub Preview',
                  email: 'preview@jantahr.test',
                  role: 'super_admin',
                }}
                enabledModules={previewModules}
              />
            }
          >
            <Route index element={<HomePage />} />
            <Route path="payroll" element={<PayrollPreview />} />
          </Route>
        ) : null}
        <Route element={<RequireAuth />}>
          <Route element={<ProtectedShell />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/my/*" element={<PortalPage />} />
            <Route path="/hr/*" element={<HrPage />} />
            <Route path="/inventory/*" element={<WarehousePage />} />
            <Route path="/cash/*" element={<CashPage />} />
            <Route path="/tracker/*" element={<TrackerPage />} />
            <Route path="/reports/*" element={<ReportsPage />} />
            <Route path="/admin/*" element={<AdminPage />} />
          </Route>
        </Route>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}
