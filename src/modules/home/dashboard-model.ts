import type { ModuleKey, UserRole } from '../../config/modules'

export type DashboardKind =
  | 'hr'
  | 'executive'
  | 'warehouse'
  | 'project_manager'
  | 'coordinator'
  | 'employee'

export interface DashboardActionModel {
  title: string
  description: string
  to: string
  module: ModuleKey
  icon: 'people' | 'calendar' | 'target' | 'book' | 'chart' | 'project' | 'cash' | 'inventory' | 'update' | 'profile'
}

const responsibilityOrder: Array<[UserRole, DashboardKind]> = [
  ['super_admin', 'executive'],
  ['hr_admin', 'hr'],
  ['cfo', 'executive'],
  ['managing_director', 'executive'],
  ['warehouse_manager', 'warehouse'],
  ['project_manager', 'project_manager'],
  ['coordinator', 'coordinator'],
  ['employee', 'employee'],
]

export function resolveDashboardKind(roles: readonly UserRole[]): DashboardKind {
  const roleSet = new Set(roles)
  return responsibilityOrder.find(([role]) => roleSet.has(role))?.[1] ?? 'employee'
}

const dashboardActions: Record<DashboardKind, DashboardActionModel[]> = {
  executive: [
    { title: 'Open reports', description: 'Review company performance and exceptions', to: '/reports', module: 'reports', icon: 'chart' },
    { title: 'Review projects', description: 'See delivery status, risk, cash and inventory', to: '/projects', module: 'projects', icon: 'project' },
    { title: 'Project cash', description: 'Review advances and accountability', to: '/cash/advances', module: 'cash', icon: 'cash' },
    { title: 'Inventory overview', description: 'Review stock, assets and pending requests', to: '/inventory/overview', module: 'inventory', icon: 'inventory' },
  ],
  hr: [
    { title: 'Employee directory', description: 'Manage staff records and employment details', to: '/hr/employees', module: 'hr', icon: 'people' },
    { title: 'Log or approve leave', description: 'Manage employee leave and the team calendar', to: '/hr/leave', module: 'hr', icon: 'calendar' },
    { title: 'Performance reviews', description: 'Manage goals, cycles and acknowledgements', to: '/hr/performance', module: 'hr', icon: 'target' },
    { title: 'Training records', description: 'Track learning, certificates and expiry alerts', to: '/hr/training', module: 'hr', icon: 'book' },
  ],
  warehouse: [
    { title: 'Receive consumables', description: 'Add or receive an item into HQ Warehouse', to: '/inventory/consumables', module: 'inventory', icon: 'inventory' },
    { title: 'Add equipment', description: 'Register a serialized equipment asset', to: '/inventory/equipment', module: 'inventory', icon: 'inventory' },
    { title: 'Pending requests', description: 'Approve or fulfil project stock requests', to: '/inventory/requests', module: 'inventory', icon: 'update' },
    { title: 'Ledger history', description: 'Review auditable inventory movements', to: '/inventory/history', module: 'inventory', icon: 'chart' },
  ],
  project_manager: [
    { title: 'Manage projects', description: 'Review teams, status and operational details', to: '/projects', module: 'projects', icon: 'project' },
    { title: 'Review daily updates', description: 'Endorse progress or request a revision', to: '/tracker/daily-updates', module: 'tracker', icon: 'update' },
    { title: 'Request project stock', description: 'Create or monitor a project requisition', to: '/inventory/requests', module: 'inventory', icon: 'inventory' },
    { title: 'Request project cash', description: 'Request and account for operational funds', to: '/cash/advances', module: 'cash', icon: 'cash' },
  ],
  coordinator: [
    { title: 'Submit field update', description: 'Record today’s project progress and photos', to: '/tracker/daily-updates', module: 'tracker', icon: 'update' },
    { title: 'My projects', description: 'Open assigned project workspaces', to: '/projects', module: 'projects', icon: 'project' },
    { title: 'Request project stock', description: 'Request materials or equipment for the site', to: '/inventory/requests', module: 'inventory', icon: 'inventory' },
    { title: 'Request project cash', description: 'Request operational funds for an assignment', to: '/cash/advances', module: 'cash', icon: 'cash' },
  ],
  employee: [
    { title: 'My profile', description: 'Review personal and employment information', to: '/my/profile', module: 'my_workspace', icon: 'profile' },
    { title: 'Request leave', description: 'Submit leave and follow HR approval', to: '/my/leave', module: 'my_workspace', icon: 'calendar' },
    { title: 'My performance', description: 'Review goals, assessments and acknowledgements', to: '/my/performance', module: 'my_workspace', icon: 'target' },
    { title: 'My training', description: 'Review training and certificate records', to: '/my/training', module: 'my_workspace', icon: 'book' },
  ],
}

export function getDashboardActions(
  kind: DashboardKind,
  enabledModules: readonly ModuleKey[],
): DashboardActionModel[] {
  const enabled = new Set(enabledModules)
  return dashboardActions[kind].filter((action) => enabled.has(action.module))
}
