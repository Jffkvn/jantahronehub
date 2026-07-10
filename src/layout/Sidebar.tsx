import { ChevronLeft, ChevronRight, LogOut, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import type { OneHubModule } from '../config/modules'

interface SidebarProps {
  modules: readonly OneHubModule[]
  collapsed: boolean
  mobileOpen: boolean
  onCollapse: () => void
  onCloseMobile: () => void
  onSignOut?: () => void
}

function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="oh-brand">
      <span className="oh-brand__mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {!collapsed && (
        <span className="oh-brand__copy">
          <strong role="heading" aria-level={2}>Egypro OneHub</strong>
          <small>Powered by JantaHR</small>
        </span>
      )}
    </div>
  )
}

export function Sidebar({
  modules,
  collapsed,
  mobileOpen,
  onCollapse,
  onCloseMobile,
  onSignOut,
}: SidebarProps) {
  const grouped = modules.reduce<Partial<Record<OneHubModule['section'], OneHubModule[]>>>(
    (sections, module) => {
      const sectionItems = sections[module.section] ?? []
      sections[module.section] = [...sectionItems, module]
      return sections
    },
    {},
  )

  return (
    <>
      {mobileOpen && (
        <button
          className="oh-sidebar-backdrop"
          type="button"
          aria-label="Dismiss navigation"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`oh-sidebar${collapsed ? ' oh-sidebar--collapsed' : ''}${mobileOpen ? ' oh-sidebar--open' : ''}`}
        aria-label={mobileOpen ? 'Main navigation' : 'Primary navigation'}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen || undefined}
      >
        <div className="oh-sidebar__brand-row">
          <Brand collapsed={collapsed} />
          <button
            className="oh-icon-button oh-sidebar__mobile-close"
            type="button"
            aria-label="Close navigation"
            onClick={onCloseMobile}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="oh-sidebar__nav" aria-label="Main menu">
          {Object.entries(grouped).map(([section, items]) => (
            <section className="oh-nav-section" key={section}>
              {!collapsed && <h2>{section}</h2>}
              <div className="oh-nav-section__items">
                {items?.map((module) => {
                  const Icon = module.icon
                  return (
                    <NavLink
                      className={({ isActive }) =>
                        `oh-nav-link${isActive ? ' oh-nav-link--active' : ''}`
                      }
                      to={module.path}
                      key={module.key}
                      title={collapsed ? module.label : undefined}
                      onClick={onCloseMobile}
                    >
                      <Icon size={19} aria-hidden="true" />
                      {!collapsed && <span>{module.label}</span>}
                    </NavLink>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="oh-sidebar__footer">
          {onSignOut && (
            <button className="oh-nav-link oh-nav-link--button" type="button" onClick={onSignOut}>
              <LogOut size={19} aria-hidden="true" />
              {!collapsed && <span>Sign out</span>}
            </button>
          )}
          <button
            className="oh-sidebar__collapse"
            type="button"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={onCollapse}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>
    </>
  )
}
