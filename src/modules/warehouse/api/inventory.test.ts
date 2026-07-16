import { describe, expect, it, vi } from 'vitest'

import { createInventoryApi } from './inventory'

describe('inventory API project links', () => {
  it('creates stock requests with a canonical project id and equipment return date', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: '11111111-1111-4111-8111-111111111111',
      error: null,
    })
    const api = createInventoryApi({ rpc })
    const items = [{
      consumable_item_id: null,
      equipment_asset_id: '22222222-2222-4222-8222-222222222222',
      quantity: 1,
      estimated_unit_price: 500000,
      expected_return_date: '2026-08-31',
    }]

    await expect(api.requestStock(
      '33333333-3333-4333-8333-333333333333',
      items,
    )).resolves.toBe('11111111-1111-4111-8111-111111111111')

    expect(rpc).toHaveBeenCalledWith('rpc_request_stock', {
      p_project_id: '33333333-3333-4333-8333-333333333333',
      p_items: items,
    })
  })
})
