import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TrackerPage from './TrackerPage'

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { permissionKeys: ['daily_updates.read_all'] } }),
}))
vi.mock('./pages/OverviewTab', () => ({ OverviewTab: () => <div>Projects overview</div> }))
vi.mock('./pages/ProjectDetailsTab', () => ({ ProjectDetailsTab: () => <div>Project detail</div> }))
vi.mock('./pages/DailyUpdatesTab', () => ({ DailyUpdatesTab: () => <div>Daily updates</div> }))
vi.mock('./pages/MissedUpdatesTab', () => ({ MissedUpdatesTab: () => <div>Missed updates</div> }))

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('TrackerPage navigation', () => {
  it('uses canonical project-workspace URLs from a tracker child route', () => {
    render(
      <MemoryRouter initialEntries={['/tracker/overview']}>
        <Routes>
          <Route path="/tracker/*" element={<TrackerPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const expectedLinks = {
      Overview: '/tracker/overview',
      'Daily Updates': '/tracker/daily-updates',
      'Missed Updates': '/tracker/missed-updates',
    }

    for (const [name, href] of Object.entries(expectedLinks)) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('recovers an invalid tracker URL to the canonical overview once', async () => {
    render(
      <MemoryRouter initialEntries={['/tracker/not-a-page']}>
        <CurrentPath />
        <Routes>
          <Route path="/tracker/*" element={<TrackerPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Current path')).toHaveTextContent('/tracker/overview')
  })

  it('keeps Overview active while viewing a project detail', () => {
    render(
      <MemoryRouter initialEntries={['/tracker/projects/project-1']}>
        <Routes>
          <Route path="/tracker/*" element={<TrackerPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
