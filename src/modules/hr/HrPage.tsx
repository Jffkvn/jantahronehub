import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { RequirePermission } from '../auth/RequirePermission'

import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage'
import { EmployeeDossierPage } from './pages/EmployeeDossierPage'
import { EmployeeImportPage } from './pages/EmployeeImportPage'
import { LeaveManagementPage } from './pages/LeaveManagementPage'
import { StaffAdvancesPage } from './pages/StaffAdvancesPage'
import { PerformanceManagementPage } from './pages/PerformanceManagementPage'
import { PayrollRunsPage } from '../payroll/pages/PayrollRunsPage'
import { PayrollRunPage } from '../payroll/pages/PayrollRunPage'
import { defaultHrPath } from './navigation'
import { HrNavigation } from './components/HrNavigation'

const HistoricalPayrollMigrationPage = lazy(() =>
  import('../migrations/pages/HistoricalPayrollMigrationPage').then((module) => ({
    default: module.HistoricalPayrollMigrationPage,
  }))
)

const HrSetupPage = lazy(() =>
  import('./pages/HrSetupPage').then((module) => ({
    default: module.HrSetupPage,
  }))
)

function EmployeeDossierRoute({ permissions }: { permissions: string[] }) {
  const { employeeId } = useParams()
  return employeeId ? <EmployeeDossierPage employeeId={employeeId} permissions={permissions} /> : <Navigate to="/hr/employees" replace />
}

function PayrollRunRoute({ permissions }: { permissions: string[] }) {
  const { runId } = useParams()
  return runId ? <PayrollRunPage runId={runId} permissions={permissions} /> : <Navigate to="/hr/payroll" replace />
}

export default function HrPage() {
  const { access } = useAuth()
  const permissions = access?.permissionKeys ?? []
  const landingPath = defaultHrPath(permissions)
  return (
    <div className="oh-workspace-page">
      <HrNavigation permissions={permissions} />
      <Routes>
        <Route index element={<Navigate to={landingPath} replace />} />
        <Route element={<RequirePermission permission="employees.read" />}>
          <Route path="employees" element={<EmployeeDirectoryPage />} />
          <Route path="employees/:employeeId" element={<EmployeeDossierRoute permissions={permissions} />} />
        </Route>
        <Route element={<RequirePermission allOf={['employees.read', 'employee_imports.manage']} />}>
          <Route path="employees/import" element={<EmployeeImportPage />} />
        </Route>
        <Route element={<RequirePermission permission="payroll.read" />}>
          <Route path="payroll" element={<PayrollRunsPage permissions={permissions} />} />
          <Route path="payroll/:runId" element={<PayrollRunRoute permissions={permissions} />} />
        </Route>
        <Route element={<RequirePermission permission="leave.manage" />}>
          <Route path="leave" element={<LeaveManagementPage />} />
        </Route>
        <Route element={<RequirePermission permission="staff_advances.manage" />}>
          <Route path="staff-advances" element={<StaffAdvancesPage />} />
        </Route>
        <Route element={<RequirePermission permission="performance.manage" />}>
          <Route path="performance" element={<PerformanceManagementPage />} />
        </Route>
        <Route element={<RequirePermission permission="payroll.migrate_history" />}>
          <Route
            path="payroll/history-migration"
            element={
              <Suspense fallback={<div role="status">Loading...</div>}>
                <HistoricalPayrollMigrationPage />
              </Suspense>
            }
          />
        </Route>
        <Route element={<RequirePermission permission="employees.manage_setup" />}>
          <Route
            path="setup"
            element={
              <Suspense fallback={<div role="status">Loading HR setup…</div>}>
                <HrSetupPage />
              </Suspense>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to={landingPath} replace />} />
      </Routes>
    </div>
  )
}
