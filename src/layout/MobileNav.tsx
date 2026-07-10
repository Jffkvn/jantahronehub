import { Grid2X2Plus } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import type { OneHubModule } from '../config/modules'

interface MobileNavProps {
  modules: readonly OneHubModule[]
  onMore: () => void
}

export function MobileNav({ modules, onMore }: MobileNavProps) {
  const primaryModules = modules.filter((module) => module.showInMobileBar).slice(0, 4)

  return (
    <nav className="oh-mobile-nav" aria-label="Mobile navigation">
      {primaryModules.map((module) => {
        const Icon = module.icon
        return (
          <NavLink
            to={module.path}
            key={module.key}
            className={({ isActive }) =>
              `oh-mobile-nav__link${isActive ? ' oh-mobile-nav__link--active' : ''}`
            }
          >
            <Icon size={20} aria-hidden="true" />
            <span>{module.shortLabel}</span>
          </NavLink>
        )
      })}
      <button className="oh-mobile-nav__link" type="button" onClick={onMore}>
        <Grid2X2Plus size={20} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  )
}
