import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { CashAdvancesPage } from './CashAdvancesPage'

const { getOperationalProjects } = vi.hoisted(() => ({
  getOperationalProjects: vi.fn(),
}))

vi.mock('../api/cash', () => ({
  cashApi: {
    getRequests: vi.fn().mockResolvedValue([]),
    getOperationalProjects,
    getActiveProfiles: vi.fn().mockResolvedValue([]),
    checkOutstandingAdvances: vi.fn().mockResolvedValue(false),
    requestAdvance: vi.fn(),
  },
}))

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({
    access: {
      profile: { id: '05de72c7-9baa-44ae-b11b-dfd1f2975c90', displayName: 'Olivia Pope' },
      permissionKeys: ['cash_advances.request'],
      roleKeys: ['coordinator'],
    },
  }),
}))

describe('CashAdvancesPage project eligibility', () => {
  beforeEach(() => {
    getOperationalProjects.mockResolvedValue([
      { id: 'e467026a-6dd4-4f59-af90-2256e973a0f4', name: 'Mbarara MTN Site Upgrade' },
    ])
  })

  it('offers an assigned planned project when Olivia requests project cash', async () => {
    const user = userEvent.setup()
    renderWithProviders(<CashAdvancesPage />)

    await user.click(screen.getByRole('button', { name: /request advance/i }))

    expect(await screen.findByRole('option', { name: 'Mbarara MTN Site Upgrade' })).toBeInTheDocument()
    expect(getOperationalProjects).toHaveBeenCalledOnce()
  })
})

