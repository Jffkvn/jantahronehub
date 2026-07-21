import type { ModuleKey } from '../../config/modules'
import { ProjectOperationsDashboard } from './ProjectOperationsDashboard'

export function ProjectManagerDashboard(props: { displayName: string; enabledModules: readonly ModuleKey[] }) {
  return <ProjectOperationsDashboard {...props} mode="project_manager" />
}
