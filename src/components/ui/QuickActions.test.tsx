import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CalendarPlus, UserPlus } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/render'
import { QuickActions } from './QuickActions'

describe('QuickActions', () => {
  it('renders navigation actions with useful descriptions', () => {
    renderWithProviders(
      <QuickActions
        title="Quick actions"
        actions={[
          {
            title: 'Add employee',
            description: 'Create a new people record',
            icon: <UserPlus aria-hidden="true" />,
            to: '/hr/employees',
          },
          {
            title: 'Log leave',
            description: 'Record approved time off',
            icon: <CalendarPlus aria-hidden="true" />,
            to: '/hr/leave',
          },
        ]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Quick actions' })).toBeVisible()
    expect(screen.getByRole('link', { name: /add employee create a new people record/i })).toHaveAttribute('href', '/hr/employees')
    expect(screen.getByRole('link', { name: /log leave record approved time off/i })).toHaveAttribute('href', '/hr/leave')
  })

  it('runs an inline action without requiring navigation', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <QuickActions
        actions={[{ title: 'Refresh', description: 'Reload current data', onSelect }]}
      />,
    )

    await user.click(screen.getByRole('button', { name: /refresh reload current data/i }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
