import type { ModuleKey } from '../../config/modules'
import { ProjectOperationsDashboard } from './ProjectOperationsDashboard'

export function CoordinatorDashboard(props: { displayName: string; enabledModules: readonly ModuleKey[] }) {
  return <ProjectOperationsDashboard {...props} mode="coordinator" />
}
