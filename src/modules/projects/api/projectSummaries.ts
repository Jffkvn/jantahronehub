import { z } from 'zod'

import { getSupabaseClient } from '../../../lib/supabase/client'

interface RpcClient {
  rpc(name: string, parameters?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

const cashRowSchema = z.object({
  requested: z.coerce.number(),
  approved: z.coerce.number(),
  disbursed: z.coerce.number(),
  accepted_expenses: z.coerce.number(),
  returned_cash: z.coerce.number(),
  outstanding_balance: z.coerce.number(),
  pending_accountability_count: z.coerce.number().int(),
  receipt_exception_count: z.coerce.number().int(),
})

const inventoryRowSchema = z.object({
  draft_request_count: z.coerce.number().int(),
  pending_request_count: z.coerce.number().int(),
  approved_request_count: z.coerce.number().int(),
  fulfilled_request_count: z.coerce.number().int(),
  rejected_request_count: z.coerce.number().int(),
  requested_estimated_value: z.coerce.number(),
  issued_estimated_value: z.coerce.number(),
  issued_consumable_quantity: z.coerce.number().int(),
  active_equipment_custody_count: z.coerce.number().int(),
  overdue_return_count: z.coerce.number().int(),
  damaged_or_lost_return_count: z.coerce.number().int(),
  unresolved_legacy_link_count: z.coerce.number().int(),
})

export interface ProjectCashSummary {
  requested: number
  approved: number
  disbursed: number
  acceptedExpenses: number
  returnedCash: number
  outstandingBalance: number
  pendingAccountabilityCount: number
  receiptExceptionCount: number
}

export interface ProjectInventorySummary {
  draftRequestCount: number
  pendingRequestCount: number
  approvedRequestCount: number
  fulfilledRequestCount: number
  rejectedRequestCount: number
  requestedEstimatedValue: number
  issuedEstimatedValue: number
  issuedConsumableQuantity: number
  activeEquipmentCustodyCount: number
  overdueReturnCount: number
  damagedOrLostReturnCount: number
  unresolvedLegacyLinkCount: number
}

export function createProjectSummariesApi(
  client: RpcClient = getSupabaseClient() as unknown as RpcClient,
) {
  return {
    async cash(projectId: string): Promise<ProjectCashSummary> {
      const { data, error } = await client.rpc('rpc_get_project_cash_summary', {
        p_project_id: z.uuid().parse(projectId),
      })
      if (error) throw new Error('Project cash summary could not be loaded.')
      const row = cashRowSchema.parse(z.array(z.unknown()).parse(data)[0] ?? {
        requested: 0, approved: 0, disbursed: 0, accepted_expenses: 0,
        returned_cash: 0, outstanding_balance: 0,
        pending_accountability_count: 0, receipt_exception_count: 0,
      })
      return {
        requested: row.requested,
        approved: row.approved,
        disbursed: row.disbursed,
        acceptedExpenses: row.accepted_expenses,
        returnedCash: row.returned_cash,
        outstandingBalance: row.outstanding_balance,
        pendingAccountabilityCount: row.pending_accountability_count,
        receiptExceptionCount: row.receipt_exception_count,
      }
    },
    async inventory(projectId: string): Promise<ProjectInventorySummary> {
      const { data, error } = await client.rpc('rpc_get_project_inventory_summary', {
        p_project_id: z.uuid().parse(projectId),
      })
      if (error) throw new Error('Project inventory summary could not be loaded.')
      const row = inventoryRowSchema.parse(z.array(z.unknown()).parse(data)[0] ?? {
        draft_request_count: 0, pending_request_count: 0,
        approved_request_count: 0, fulfilled_request_count: 0,
        rejected_request_count: 0, requested_estimated_value: 0,
        issued_estimated_value: 0, issued_consumable_quantity: 0,
        active_equipment_custody_count: 0, overdue_return_count: 0,
        damaged_or_lost_return_count: 0, unresolved_legacy_link_count: 0,
      })
      return {
        draftRequestCount: row.draft_request_count,
        pendingRequestCount: row.pending_request_count,
        approvedRequestCount: row.approved_request_count,
        fulfilledRequestCount: row.fulfilled_request_count,
        rejectedRequestCount: row.rejected_request_count,
        requestedEstimatedValue: row.requested_estimated_value,
        issuedEstimatedValue: row.issued_estimated_value,
        issuedConsumableQuantity: row.issued_consumable_quantity,
        activeEquipmentCustodyCount: row.active_equipment_custody_count,
        overdueReturnCount: row.overdue_return_count,
        damagedOrLostReturnCount: row.damaged_or_lost_return_count,
        unresolvedLegacyLinkCount: row.unresolved_legacy_link_count,
      }
    },
  }
}

export const projectSummariesApi = createProjectSummariesApi()
