import { z } from 'zod'
import { getSupabaseClient } from '../../../lib/supabase/client'

interface RpcClient { rpc(name: string, parameters?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> }

const historySchema = z.object({
  event_type: z.string(), occurred_at: z.string(), actor_name: z.string().nullable(), reason: z.string().nullable(),
})
const warningSchema = z.object({ domain: z.string(), message: z.string() })
const completionSchema = z.object({ can_complete: z.boolean(), warnings: z.array(warningSchema) })

export interface ProjectHistoryEvent { eventType: string; occurredAt: string; actorName: string | null; reason: string | null }
export interface CompletionCheck { canComplete: boolean; warnings: Array<{ domain: string; message: string }> }

export function createProjectOperationsApi(client: RpcClient = getSupabaseClient() as unknown as RpcClient) {
  return {
    async history(projectId: string): Promise<ProjectHistoryEvent[]> {
      const { data, error } = await client.rpc('rpc_get_project_history', { p_project_id: z.uuid().parse(projectId) })
      if (error) throw new Error('Project history could not be loaded.')
      return z.array(historySchema).parse(data).map((row) => ({ eventType: row.event_type, occurredAt: row.occurred_at, actorName: row.actor_name, reason: row.reason }))
    },
    async checkCompletion(projectId: string): Promise<CompletionCheck> {
      const { data, error } = await client.rpc('rpc_check_project_completion', { p_project_id: z.uuid().parse(projectId) })
      if (error) throw new Error('Project completion checks could not be loaded.')
      const row = completionSchema.parse(data)
      return { canComplete: row.can_complete, warnings: row.warnings }
    },
    async transition(projectId: string, targetStatus: string, reason: string): Promise<void> {
      const { error } = await client.rpc('rpc_transition_project_status', {
        p_project_id: z.uuid().parse(projectId), p_target_status: targetStatus,
        p_reason: z.string().trim().min(3).max(500).parse(reason),
      })
      if (error) throw new Error('Project status could not be changed.')
    },
  }
}

export const projectOperationsApi = createProjectOperationsApi()
