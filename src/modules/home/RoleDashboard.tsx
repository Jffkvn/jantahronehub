import {
  BarChart3,
  BookOpenCheck,
  Boxes,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FolderKanban,
  Target,
  UserRound,
  UsersRound,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { QuickActions } from '../../components/ui/QuickActions'
import type { ModuleKey } from '../../config/modules'
import { getDashboardActions, type DashboardActionModel, type DashboardKind } from './dashboard-model'

const actionIcons: Record<DashboardActionModel['icon'], ReactNode> = {
  people: <UsersRound size={18} aria-hidden="true" />,
  calendar: <CalendarDays size={18} aria-hidden="true" />,
  target: <Target size={18} aria-hidden="true" />,
  book: <BookOpenCheck size={18} aria-hidden="true" />,
  chart: <BarChart3 size={18} aria-hidden="true" />,
  project: <FolderKanban size={18} aria-hidden="true" />,
  cash: <CircleDollarSign size={18} aria-hidden="true" />,
  inventory: <Boxes size={18} aria-hidden="true" />,
  update: <ClipboardCheck size={18} aria-hidden="true" />,
  profile: <UserRound size={18} aria-hidden="true" />,
}

export function DashboardQuickActions({ kind, enabledModules }: { kind: DashboardKind; enabledModules: readonly ModuleKey[] }) {
  const actions = getDashboardActions(kind, enabledModules).map((action) => ({
    ...action,
    icon: actionIcons[action.icon],
  }))
  return <QuickActions actions={actions} />
}

export function DashboardState({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'error' }) {
  return <div className={`oh-role-dashboard__state oh-role-dashboard__state--${tone}`}>{children}</div>
}

export function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    notation: value >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value)
}

export function formatDashboardDate(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-UG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Kampala',
  }).format(date)
}

export function groupCounts(values: readonly string[]) {
  const counts = new Map<string, number>()
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  return [...counts.entries()].map(([label, value]) => ({ label: label.replaceAll('_', ' '), value }))
}
