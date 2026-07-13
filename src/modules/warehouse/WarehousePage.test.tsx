import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import WarehousePage from './WarehousePage'

vi.mock('./pages/OverviewPage', () => ({ OverviewPage: () => <div>Inventory overview</div> }))
vi.mock('./pages/ConsumablesPage', () => ({ ConsumablesPage: () => <div>Consumables</div> }))
vi.mock('./pages/EquipmentPage', () => ({ EquipmentPage: () => <div>Equipment</div> }))
vi.mock('./pages/RequestsPage', () => ({ RequestsPage: () => <div>Requests</div> }))
vi.mock('./pages/RequestDetailPage', () => ({ RequestDetailPage: () => <div>Request detail</div> }))
vi.mock('./pages/HistoryPage', () => ({ HistoryPage: () => <div>History</div> }))
vi.mock('./pages/BulkToolsPage', () => ({ BulkToolsPage: () => <div>Bulk tools</div> }))

function CurrentPath() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('WarehousePage navigation', () => {
  it('uses canonical module URLs from an existing inventory child route', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/overview']}>
        <Routes>
          <Route path="/inventory/*" element={<WarehousePage />} />
        </Routes>
      </MemoryRouter>,
    )

    const expectedLinks = {
      Overview: '/inventory/overview',
      Consumables: '/inventory/consumables',
      Equipment: '/inventory/equipment',
      Requests: '/inventory/requests',
      'Ledger History': '/inventory/history',
      'Bulk Tools': '/inventory/bulk-tools',
    }

    for (const [name, href] of Object.entries(expectedLinks)) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('recovers an invalid inventory URL to the canonical overview once', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory/not-a-page']}>
        <CurrentPath />
        <Routes>
          <Route path="/inventory/*" element={<WarehousePage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByLabelText('Current path')).toHaveTextContent('/inventory/overview')
  })
})
