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
  }
}

export const projectSummariesApi = createProjectSummariesApi()
