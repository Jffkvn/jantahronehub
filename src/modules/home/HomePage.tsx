import { useAuth } from '../auth/AuthProvider'
import { CoordinatorDashboard } from './CoordinatorDashboard'
import { EmployeeDashboard } from './EmployeeDashboard'
import { ExecutiveDashboard } from './ExecutiveDashboard'
import { HrDashboard } from './HrDashboard'
import { ProjectManagerDashboard } from './ProjectManagerDashboard'
import { WarehouseDashboard } from './WarehouseDashboard'
import { resolveDashboardKind } from './dashboard-model'

export default function HomePage() {
  const { access, session } = useAuth()
  if (!access) return null

  const props = {
    displayName: access.profile?.displayName || session?.email || 'Egypro colleague',
    enabledModules: access.enabledModules,
  }

  switch (resolveDashboardKind(access.roleKeys)) {
    case 'executive': return <ExecutiveDashboard {...props} />
    case 'hr': return <HrDashboard {...props} />
    case 'warehouse': return <WarehouseDashboard {...props} />
    case 'project_manager': return <ProjectManagerDashboard {...props} />
    case 'coordinator': return <CoordinatorDashboard {...props} />
    default: return <EmployeeDashboard {...props} />
  }
}
