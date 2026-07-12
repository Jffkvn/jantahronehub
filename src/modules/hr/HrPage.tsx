import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage'
import { EmployeeDossierPage } from './pages/EmployeeDossierPage'
import { EmployeeImportPage } from './pages/EmployeeImportPage'
import { PayrollRunsPage } from '../payroll/pages/PayrollRunsPage'
import { PayrollRunPage } from '../payroll/pages/PayrollRunPage'
import { defaultHrPath } from './navigation'

function EmployeeDossierRoute() {
  const { employeeId } = useParams()
  return employeeId ? <EmployeeDossierPage employeeId={employeeId} /> : <Navigate to="/hr/employees" replace />
}

function PayrollRunRoute({ permissions }: { permissions: string[] }) {
  const { runId } = useParams()
  return runId ? <PayrollRunPage runId={runId} permissions={permissions} /> : <Navigate to="/hr/payroll" replace />
}

export default function HrPage() {
  const { access } = useAuth()
  const permissions = access?.permissionKeys ?? []
  const landingPath = defaultHrPath(permissions)
  return <Routes><Route index element={<Navigate to={landingPath} replace />} /><Route path="employees" element={<EmployeeDirectoryPage />} /><Route path="employees/import" element={<EmployeeImportPage />} /><Route path="employees/:employeeId" element={<EmployeeDossierRoute />} /><Route path="payroll" element={<PayrollRunsPage permissions={permissions} />} /><Route path="payroll/:runId" element={<PayrollRunRoute permissions={permissions} />} /><Route path="*" element={<Navigate to={landingPath} replace />} /></Routes>
}
