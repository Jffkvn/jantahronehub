import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import { EmployeeDirectoryPage } from './pages/EmployeeDirectoryPage'
import { EmployeeDossierPage } from './pages/EmployeeDossierPage'
import { EmployeeImportPage } from './pages/EmployeeImportPage'

function EmployeeDossierRoute() {
  const { employeeId } = useParams()
  return employeeId ? <EmployeeDossierPage employeeId={employeeId} /> : <Navigate to="/hr/employees" replace />
}

export default function HrPage() {
  return <Routes><Route path="employees" element={<EmployeeDirectoryPage />} /><Route path="employees/import" element={<EmployeeImportPage />} /><Route path="employees/:employeeId" element={<EmployeeDossierRoute />} /><Route path="*" element={<Navigate to="employees" replace />} /></Routes>
}
