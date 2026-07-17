import { Menu, Search } from 'lucide-react'

import { roleLabels, type UserRole } from '../config/modules'
import { NotificationCenter } from '../modules/notifications/NotificationCenter'

interface TopbarProps {
  pageTitle: string
  currentUser: {
    name: string
    email: string
    role: UserRole
  }
  mobileMenuOpen: boolean
  onOpenNavigation: () => void
}

export function Topbar({
  pageTitle,
  currentUser,
  mobileMenuOpen,
  onOpenNavigation,
}: TopbarProps) {
  const initials = currentUser.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="oh-topbar">
      <div className="oh-topbar__context">
        <button
          className="oh-icon-button oh-topbar__menu"
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileMenuOpen}
          onClick={onOpenNavigation}
        >
          <Menu size={22} />
        </button>
        <div>
          <p className="oh-topbar__eyebrow">Egypro Uganda</p>
          <h1>{pageTitle}</h1>
        </div>
      </div>

      <div className="oh-topbar__actions">
        <label className="oh-quick-search">
          <Search size={17} aria-hidden="true" />
          <span className="oh-sr-only">Search OneHub</span>
          <input type="search" placeholder="Search OneHub" />
        </label>
        <NotificationCenter userIdentity={currentUser.email} />
        <div className="oh-user-summary">
          <span className="oh-user-summary__avatar" aria-hidden="true">{initials}</span>
          <span className="oh-user-summary__copy">
            <strong>{currentUser.name}</strong>
            <small>{currentUser.email}</small>
          </span>
        </div>
        <span className="oh-role-badge">{roleLabels[currentUser.role]}</span>
      </div>
    </header>
  )
}
