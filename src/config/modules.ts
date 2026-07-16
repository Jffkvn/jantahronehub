import {
  BriefcaseBusiness,
  ChartNoAxesCombined,
  CircleDollarSign,
  FolderKanban,
  House,
  PackageOpen,
  Settings,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export type UserRole =
  | 'super_admin'
  | 'hr_admin'
  | 'employee'
  | 'coordinator'
  | 'project_manager'
  | 'warehouse_manager'
  | 'cfo'
  | 'managing_director'

export type ModuleKey =
  | 'home'
  | 'my_workspace'
  | 'hr'
  | 'inventory'
  | 'cash'
  | 'projects'
  | 'tracker'
  | 'reports'
  | 'admin'

export interface OneHubModule {
  key: ModuleKey
  label: string
  shortLabel: string
  description: string
  path: string
  section: 'Overview' | 'People' | 'Operations' | 'Governance'
  icon: LucideIcon
  roles: readonly UserRole[]
  showInMobileBar?: boolean
}

const allRoles: readonly UserRole[] = [
  'super_admin',
  'hr_admin',
  'employee',
  'coordinator',
  'project_manager',
  'warehouse_manager',
  'cfo',
  'managing_director',
]

export const oneHubModules: readonly OneHubModule[] = [
  {
    key: 'home',
    label: 'Home',
    shortLabel: 'Home',
    description: 'Your role-aware operational overview',
    path: '/home',
    section: 'Overview',
    icon: House,
    roles: allRoles,
    showInMobileBar: true,
  },
  {
    key: 'my_workspace',
    label: 'My Workspace',
    shortLabel: 'My work',
    description: 'Personal details, requests, and documents',
    path: '/my',
    section: 'People',
    icon: UserRound,
    roles: allRoles,
    showInMobileBar: true,
  },
  {
    key: 'hr',
    label: 'HR Management',
    shortLabel: 'HR',
    description: 'Employees, leave, payroll, and development',
    path: '/hr',
    section: 'People',
    icon: UsersRound,
    roles: ['super_admin', 'hr_admin', 'cfo'],
  },
  {
    key: 'inventory',
    label: 'Inventory Operations',
    shortLabel: 'Inventory',
    description: 'Stock, equipment, requests, and custody',
    path: '/inventory',
    section: 'Operations',
    icon: PackageOpen,
    roles: [
      'super_admin',
      'coordinator',
      'project_manager',
      'warehouse_manager',
      'cfo',
    ],
    showInMobileBar: true,
  },
  {
    key: 'cash',
    label: 'Project Cash',
    shortLabel: 'Cash',
    description: 'Advances, accountability, and outstanding balances',
    path: '/cash',
    section: 'Operations',
    icon: CircleDollarSign,
    roles: [
      'super_admin',
      'coordinator',
      'project_manager',
      'cfo',
      'managing_director',
    ],
    showInMobileBar: true,
  },
  {
    key: 'projects',
    label: 'Projects',
    shortLabel: 'Projects',
    description: 'Project setup, teams, status, cash, and inventory',
    path: '/projects',
    section: 'Operations',
    icon: FolderKanban,
    roles: [
      'super_admin',
      'coordinator',
      'project_manager',
      'warehouse_manager',
      'cfo',
      'managing_director',
    ],
    showInMobileBar: true,
  },
  {
    key: 'tracker',
    label: 'Daily Tracker',
    shortLabel: 'Tracker',
    description: 'Project progress and field updates',
    path: '/tracker',
    section: 'Operations',
    icon: BriefcaseBusiness,
    roles: [
      'super_admin',
      'coordinator',
      'project_manager',
      'managing_director',
    ],
  },
  {
    key: 'reports',
    label: 'Reports & Audits',
    shortLabel: 'Reports',
    description: 'Operational reporting and audit visibility',
    path: '/reports',
    section: 'Governance',
    icon: ChartNoAxesCombined,
    roles: [
      'super_admin',
      'hr_admin',
      'cfo',
      'managing_director',
    ],
  },
  {
    key: 'admin',
    label: 'System Administration',
    shortLabel: 'Admin',
    description: 'Users, access, modules, and company settings',
    path: '/admin',
    section: 'Governance',
    icon: Settings,
    roles: ['super_admin', 'hr_admin'],
  },
] as const

export function getVisibleModules(
  role: UserRole,
  enabledModules: readonly string[],
) {
  const enabled = new Set(enabledModules)

  return oneHubModules.filter(
    (module) => enabled.has(module.key) && module.roles.includes(role),
  )
}

export const roleLabels: Record<UserRole, string> = {
  super_admin: 'Super Administrator',
  hr_admin: 'HR Administrator',
  employee: 'Employee',
  coordinator: 'Project Coordinator',
  project_manager: 'Project Manager',
  warehouse_manager: 'Warehouse Manager',
  cfo: 'Chief Finance Officer',
  managing_director: 'Managing Director',
}
