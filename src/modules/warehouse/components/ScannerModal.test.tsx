import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { inventoryApi } from '../api/inventory'
import { ScannerModal } from './ScannerModal'

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false
    start = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(undefined)
  },
}))

vi.mock('../api/inventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/inventory')>()
  return {
    ...actual,
    inventoryApi: {
      ...actual.inventoryApi,
      listWarehouses: vi.fn(),
      listRequests: vi.fn(),
      listEquipment: vi.fn(),
      listConsumables: vi.fn(),
      getRequestItems: vi.fn(),
      issueStock: vi.fn(),
      issueRequestItem: vi.fn(),
    },
  }
})

const warehouse = {
  id: 'warehouse-1',
  name: 'Central Warehouse',
  location: 'Kampala',
  status: 'active' as const,
  created_at: '2026-07-13T00:00:00Z',
}

const request = {
  id: 'request-1',
  requested_by: 'profile-1',
  project_id: 'project-1',
  project_name: 'Mbarara Site',
  status: 'approved' as const,
  total_estimated_value: 2_500_000,
  escalated_to_cfo: true,
  approved_by: 'profile-2',
  approved_at: '2026-07-13T00:00:00Z',
  created_at: '2026-07-13T00:00:00Z',
  updated_at: '2026-07-13T00:00:00Z',
  profiles_requested_by: { display_name: 'Project Manager' },
}

describe('ScannerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue([warehouse])
    vi.mocked(inventoryApi.listRequests).mockResolvedValue([request])
    vi.mocked(inventoryApi.listEquipment).mockResolvedValue([
      {
        id: 'asset-scanned',
        category_id: 'category-1',
        serial_number: 'GEN-001',
        model_name: 'Generator',
        status: 'available',
        current_warehouse_id: warehouse.id,
        is_sensitive: true,
        condition_notes: null,
        created_at: '2026-07-13T00:00:00Z',
      },
    ])
    vi.mocked(inventoryApi.getRequestItems).mockResolvedValue([
      {
        id: 'request-item-other-asset',
        request_id: request.id,
        consumable_item_id: null,
        equipment_asset_id: 'asset-requested',
        quantity: 1,
        estimated_unit_price: 2_500_000,
      },
    ])
  })

  it('refuses to issue a scanned asset that is not on the selected request', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ScannerModal open onClose={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Manual barcode fallback' }), 'EQPT:asset-scanned')
    await user.click(screen.getByRole('button', { name: 'Find' }))

    await screen.findByText('Generator')
    await user.selectOptions(screen.getByLabelText('Fulfillment Warehouse'), warehouse.id)
    await user.selectOptions(screen.getByLabelText('Approved Stock Request'), request.id)
    await user.click(screen.getByRole('button', { name: 'Confirm Handout / Checkout' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The scanned asset is not included in the selected stock request.',
    )
    expect(inventoryApi.issueStock).not.toHaveBeenCalled()
    expect(inventoryApi.issueRequestItem).not.toHaveBeenCalled()
  })

  it('issues only the matching request item for a valid scanned asset', async () => {
    vi.mocked(inventoryApi.getRequestItems).mockResolvedValue([
      {
        id: 'request-item-scanned-asset',
        request_id: request.id,
        consumable_item_id: null,
        equipment_asset_id: 'asset-scanned',
        quantity: 1,
        estimated_unit_price: 2_500_000,
      },
    ])

    const user = userEvent.setup()
    renderWithProviders(<ScannerModal open onClose={vi.fn()} />)

    await user.type(screen.getByRole('textbox', { name: 'Manual barcode fallback' }), 'GEN-001')
    await user.click(screen.getByRole('button', { name: 'Find' }))
    await screen.findByText('Generator')
    await user.selectOptions(screen.getByLabelText('Fulfillment Warehouse'), warehouse.id)
    await user.selectOptions(screen.getByLabelText('Approved Stock Request'), request.id)
    await user.click(screen.getByRole('button', { name: 'Confirm Handout / Checkout' }))

    await waitFor(() => {
      expect(inventoryApi.issueRequestItem).toHaveBeenCalledWith(
        'request-item-scanned-asset',
        warehouse.id,
        'good',
      )
    })
    expect(inventoryApi.issueStock).not.toHaveBeenCalled()
  })
})
