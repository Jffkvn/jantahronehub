import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import TrackerPage from './TrackerPage'

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ access: { permissionKeys: ['daily_updates.read_all'] } }),
}))
vi.mock('./pages/DailyUpdatesTab', () => ({ DailyUpdatesTab: () => <div>Daily updates</div> }))
vi.mock('./pages/MissedUpdatesTab', () => ({ MissedUpdatesTab: () => <div>Missed updates</div> }))

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('TrackerPage navigation', () => {
  it('only exposes daily tracking work, separate from project management', () => {
    render(
      <MemoryRouter initialEntries={['/tracker/daily-updates']}>
        <Routes>
          <Route path="/tracker/*" element={<TrackerPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const expectedLinks = {
      'Daily Updates': '/tracker/daily-updates',
      'Missed Updates': '/tracker/missed-updates',
    }

    for (const [name, href] of Object.entries(expectedLinks)) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }

    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByText('Projects overview')).not.toBeInTheDocument()
  })

  it('recovers an invalid tracker URL to daily updates once', async () => {
    render(
      <MemoryRouter initialEntries={['/tracker/not-a-page']}>
        <CurrentPath />
        <Routes>
          <Route path="/tracker/*" element={<TrackerPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Current path')).toHaveTextContent('/tracker/daily-updates')
  })

  it('redirects the old tracker overview away from project management', async () => {
    render(
      <MemoryRouter initialEntries={['/tracker/overview']}>
        <CurrentPath />
        <Routes>
          <Route path="/tracker/*" element={<TrackerPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Current path')).toHaveTextContent('/tracker/daily-updates')
  })
})
