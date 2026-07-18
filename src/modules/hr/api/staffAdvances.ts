import { z } from 'zod'

import { getSupabaseClient } from '../../../lib/supabase/client'
import { hrStaffAdvanceInputSchema, staffAdvanceDecisionSchema, staffAdvanceRepaymentSchema, staffAdvanceRequestSchema, staffAdvanceTransitionSchema, type HrStaffAdvanceInput, type StaffAdvanceDecisionInput, type StaffAdvanceRepaymentInput, type StaffAdvanceRequestInput, type StaffAdvanceTransitionInput } from '../schemas/staffAdvances'

const uuid = z.string().uuid()
const numeric = z.coerce.number()
const databaseStatus = z.enum(['pending', 'active', 'rejected', 'paid_off', 'written_off', 'flagged', 'voided'])
const source = z.enum(['employee', 'hr_on_behalf'])
const advanceRow = z.object({ id: uuid, employee_id: uuid, employee_number: z.string().optional(), employee_name: z.string(), amount: numeric, reason: z.string(), date_issued: z.string(), deduction_start_month: z.string(), num_instalments: numeric.int(), monthly_deduction: numeric, balance_remaining: numeric, status: databaseStatus, source, notes: z.string().nullable(), submitted_at: z.string() })
const eventRow = z.object({ id: uuid, event_type: z.string(), from_status: z.string().nullable(), to_status: z.string(), amount: numeric.nullable(), reason: z.string().nullable(), actor_name: z.string(), occurred_at: z.string() })

export interface StaffAdvance { id: string; employeeId: string; employeeNumber: string | null; employeeName: string; amount: number; reason: string; dateIssued: string; deductionStartMonth: string; instalments: number; monthlyDeduction: number; balanceRemaining: number; status: 'pending' | 'active' | 'rejected' | 'settled' | 'written_off' | 'flagged' | 'voided'; source: z.infer<typeof source>; notes: string | null; createdAt: string }
export interface StaffAdvanceEvent { id: string; type: string; fromStatus: string | null; toStatus: string; amount: number | null; reason: string | null; actorName: string; occurredAt: string }

export function parseStaffAdvances(value: unknown): StaffAdvance[] { return z.array(advanceRow).parse(value).map((row) => ({ id: row.id, employeeId: row.employee_id, employeeNumber: row.employee_number ?? null, employeeName: row.employee_name, amount: row.amount, reason: row.reason, dateIssued: row.date_issued, deductionStartMonth: row.deduction_start_month, instalments: row.num_instalments, monthlyDeduction: row.monthly_deduction, balanceRemaining: row.balance_remaining, status: row.status === 'paid_off' ? 'settled' : row.status, source: row.source, notes: row.notes, createdAt: row.submitted_at })) }

interface RpcResult { data: unknown; error: unknown }
export interface StaffAdvancesRpcClient { rpc(name: string, parameters?: Record<string, unknown>): PromiseLike<RpcResult> }

const exposed = new Set(['You already have an open staff advance.', 'Employee already has an open staff advance.', 'Only pending staff advances can be decided.', 'Repayment must be greater than zero and no more than the outstanding balance.'])
function safeError(error: unknown) { const message = typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' ? error.message : ''; return new Error(exposed.has(message) ? message : 'Staff advance request could not be completed.') }

export interface StaffAdvancesApi {
  listMine(): Promise<StaffAdvance[]>; listForHr(): Promise<StaffAdvance[]>; listEvents(advanceId: string): Promise<StaffAdvanceEvent[]>;
  submit(input: StaffAdvanceRequestInput): Promise<string>; logForEmployee(input: HrStaffAdvanceInput): Promise<string>; decide(input: StaffAdvanceDecisionInput): Promise<void>; recordRepayment(input: StaffAdvanceRepaymentInput): Promise<string>; transition(input: StaffAdvanceTransitionInput): Promise<void>;
}

export function createStaffAdvancesApi(client: StaffAdvancesRpcClient = getSupabaseClient() as unknown as StaffAdvancesRpcClient): StaffAdvancesApi {
  async function rpc(name: string, parameters?: Record<string, unknown>) { const { data, error } = await client.rpc(name, parameters); if (error) throw safeError(error); return data }
  return {
    async listMine() { return parseStaffAdvances(await rpc('rpc_list_my_staff_advances')) },
    async listForHr() { return parseStaffAdvances(await rpc('rpc_list_hr_staff_advances')) },
    async submit(input) { const value = staffAdvanceRequestSchema.parse(input); return uuid.parse(await rpc('rpc_submit_staff_advance', { p_amount: value.amount, p_reason: value.reason, p_num_instalments: value.instalments, p_deduction_start_month: value.deductionStartMonth })) },
    async logForEmployee(input) { const value = hrStaffAdvanceInputSchema.parse(input); return uuid.parse(await rpc('rpc_log_staff_advance', { p_employee_id: value.employeeId, p_amount: value.amount, p_reason: value.reason, p_date_issued: value.dateIssued, p_num_instalments: value.instalments, p_deduction_start_month: value.deductionStartMonth, p_notes: value.notes })) },
    async decide(input) { const value = staffAdvanceDecisionSchema.parse(input); await rpc('rpc_decide_staff_advance', { p_advance_id: value.advanceId, p_decision: value.decision, p_reason: value.reason }) },
    async recordRepayment(input) { const value = staffAdvanceRepaymentSchema.parse(input); return uuid.parse(await rpc('rpc_record_advance_repayment', { p_advance_id: value.advanceId, p_payroll_period: value.payrollPeriod, p_amount: value.amount, p_source: value.source, p_notes: value.notes })) },
    async transition(input) { const value = staffAdvanceTransitionSchema.parse(input); await rpc('rpc_transition_staff_advance', { p_advance_id: value.advanceId, p_transition: value.transition === 'reopened' ? 'reactivated' : value.transition, p_reason: value.reason }) },
    async listEvents(advanceId) { return z.array(eventRow).parse(await rpc('rpc_list_staff_advance_events', { p_advance_id: uuid.parse(advanceId) })).map((row) => ({ id: row.id, type: row.event_type, fromStatus: row.from_status, toStatus: row.to_status, amount: row.amount, reason: row.reason, actorName: row.actor_name, occurredAt: row.occurred_at })) },
  }
}

export const staffAdvancesApi = createStaffAdvancesApi()
