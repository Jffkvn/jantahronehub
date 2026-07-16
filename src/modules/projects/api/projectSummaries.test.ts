import { describe, expect, it, vi } from 'vitest'

import { createProjectSummariesApi } from './projectSummaries'

describe('project summary API', () => {
  it('maps numeric database values and calls only the aggregate RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      requested: '1500000', approved: '1500000', disbursed: '1400000',
      accepted_expenses: '500000', returned_cash: '200000', outstanding_balance: '700000',
      pending_accountability_count: 2, receipt_exception_count: 1,
    }], error: null })
    const api = createProjectSummariesApi({ rpc })
    await expect(api.cash('11111111-1111-4111-8111-111111111111')).resolves.toEqual({
      requested: 1500000, approved: 1500000, disbursed: 1400000,
      acceptedExpenses: 500000, returnedCash: 200000, outstandingBalance: 700000,
      pendingAccountabilityCount: 2, receiptExceptionCount: 1,
    })
    expect(rpc).toHaveBeenCalledWith('rpc_get_project_cash_summary', {
      p_project_id: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('maps canonical inventory and equipment aggregates', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      draft_request_count: 0,
      pending_request_count: 2,
      approved_request_count: 1,
      fulfilled_request_count: 3,
      rejected_request_count: 1,
      requested_estimated_value: '2600000',
      issued_estimated_value: '1900000',
      issued_consumable_quantity: 24,
      active_equipment_custody_count: 4,
      overdue_return_count: 1,
      damaged_or_lost_return_count: 2,
      unresolved_legacy_link_count: 1,
    }], error: null })
    const api = createProjectSummariesApi({ rpc })

    await expect(api.inventory('11111111-1111-4111-8111-111111111111')).resolves.toMatchObject({
      pendingRequestCount: 2,
      fulfilledRequestCount: 3,
      requestedEstimatedValue: 2600000,
      issuedEstimatedValue: 1900000,
      issuedConsumableQuantity: 24,
      activeEquipmentCustodyCount: 4,
      overdueReturnCount: 1,
      damagedOrLostReturnCount: 2,
      unresolvedLegacyLinkCount: 1,
    })
    expect(rpc).toHaveBeenCalledWith('rpc_get_project_inventory_summary', {
      p_project_id: '11111111-1111-4111-8111-111111111111',
    })
  })
})
