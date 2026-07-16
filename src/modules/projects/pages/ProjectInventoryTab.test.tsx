import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { projectSummariesApi } from '../api/projectSummaries'
import { ProjectInventoryTab } from './ProjectInventoryTab'

vi.mock('../api/projectSummaries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/projectSummaries')>()
  return {
    ...actual,
    projectSummariesApi: { ...actual.projectSummariesApi, inventory: vi.fn() },
  }
})

describe('ProjectInventoryTab', () => {
  it('shows reconciled requests, issued value, custody and return warnings', async () => {
    vi.mocked(projectSummariesApi.inventory).mockResolvedValue({
      draftRequestCount: 0,
      pendingRequestCount: 2,
      approvedRequestCount: 1,
      fulfilledRequestCount: 3,
      rejectedRequestCount: 1,
      requestedEstimatedValue: 2600000,
      issuedEstimatedValue: 1900000,
      issuedConsumableQuantity: 24,
      activeEquipmentCustodyCount: 4,
      overdueReturnCount: 1,
      damagedOrLostReturnCount: 2,
      unresolvedLegacyLinkCount: 1,
    })

    renderWithProviders(<ProjectInventoryTab projectId="11111111-1111-4111-8111-111111111111" />)
    expect(await screen.findByText('Inventory reconciliation')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText(/1 overdue return/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open inventory/i })).toHaveAttribute('href', '/inventory/requests?project=11111111-1111-4111-8111-111111111111')
  })
})
