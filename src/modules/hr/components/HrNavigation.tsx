import { Banknote, BarChart3, BookOpen, CalendarDays, History, Settings2, Users, WalletCards } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'

interface NavigationItem {
  label: string
  to: string
  permission: string
  icon: ReactNode
  active(pathname: string): boolean
}

const items: NavigationItem[] = [
  {
    label: 'Employees',
    to: '/hr/employees',
    permission: 'employees.read',
    icon: <Users size={17} aria-hidden="true" />,
    active: (pathname) => pathname.startsWith('/hr/employees'),
  },
  {
    label: 'Leave',
    to: '/hr/leave',
    permission: 'leave.manage',
    icon: <CalendarDays size={17} aria-hidden="true" />,
    active: (pathname) => pathname.startsWith('/hr/leave'),
  },
  {
    label: 'Staff Advances',
    to: '/hr/staff-advances',
    permission: 'staff_advances.manage',
    icon: <WalletCards size={17} aria-hidden="true" />,
    active: (pathname) => pathname.startsWith('/hr/staff-advances'),
  },
  {
    label: 'Performance',
    to: '/hr/performance',
    permission: 'performance.manage',
    icon: <BarChart3 size={17} aria-hidden="true" />,
    active: (pathname) => pathname.startsWith('/hr/performance'),
  },
  {
    label: 'Training',
    to: '/hr/training',
    permission: 'training.manage',
    icon: <BookOpen size={17} aria-hidden="true" />,
    active: (pathname) => pathname.startsWith('/hr/training'),
  },
  {
    label: 'Payroll',
    to: '/hr/payroll',
    permission: 'payroll.read',
    icon: <Banknote size={17} aria-hidden="true" />,
    active: (pathname) =>
      pathname.startsWith('/hr/payroll') && pathname !== '/hr/payroll/history-migration',
  },
  {
    label: 'Historical migration',
    to: '/hr/payroll/history-migration',
    permission: 'payroll.migrate_history',
    icon: <History size={17} aria-hidden="true" />,
    active: (pathname) => pathname === '/hr/payroll/history-migration',
  },
  {
    label: 'Setup',
    to: '/hr/setup',
    permission: 'employees.manage_setup',
    icon: <Settings2 size={17} aria-hidden="true" />,
    active: (pathname) => pathname === '/hr/setup',
  },
]

export function HrNavigation({ permissions }: { permissions: string[] }) {
  const { pathname } = useLocation()
  const visibleItems = items.filter((item) => permissions.includes(item.permission))

  if (!visibleItems.length) return null

  return (
    <nav className="oh-portal-tabs" aria-label="Human resources">
      {visibleItems.map((item) => {
        const active = item.active(pathname)
        return (
          <Link
            key={item.to}
            className={`oh-portal-tab${active ? ' oh-portal-tab--active' : ''}`}
            to={item.to}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
