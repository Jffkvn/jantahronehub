import { z } from 'zod'

import { validatePrivateFileForUpload } from '../../../lib/security/filePolicy'
import { createPrivateDownloadUrl, createPrivateObjectPath } from '../../../lib/security/privateFiles'
import { getSupabaseClient } from '../../../lib/supabase/client'
import { hrLeaveRequestInputSchema, leaveBalanceAdjustmentSchema, leaveDecisionInputSchema, leaveReasonActionSchema, leaveRequestInputSchema, type HrLeaveRequestInput, type LeaveBalanceAdjustment, type LeaveDecisionInput, type LeaveReasonAction, type LeaveRequestInput } from '../schemas/leave'

const uuid = z.string().uuid()
const numeric = z.coerce.number()
const leaveTypeRow = z.object({ id: uuid, code: z.string(), name: z.string(), is_paid: z.boolean(), default_entitlement_days: numeric.nullable(), requires_evidence: z.boolean(), color: z.string(), display_order: numeric.int() })
const requestRow = z.object({ id: uuid, employee_id: uuid, employee_name: z.string().optional(), leave_type_id: uuid, leave_type_code: z.string(), leave_type_name: z.string(), start_date: z.string(), end_date: z.string(), working_days: numeric.int(), reason: z.string(), status: z.enum(['pending', 'approved', 'rejected', 'withdrawn', 'cancelled']), source: z.enum(['employee', 'hr_on_behalf']), submitted_at: z.string() })
const balanceRow = z.object({ leave_type_id: uuid, leave_type_code: z.string(), leave_type_name: z.string(), entitled_days: numeric, adjustment_days: numeric, approved_days: numeric, remaining_days: numeric, is_paid: z.boolean() })
const documentRow = z.object({ id: uuid, storage_path: z.string(), original_file_name: z.string(), mime_type: z.string(), size_bytes: numeric, created_at: z.string() })
const holidayRow = z.object({ id: uuid, holiday_date: z.string(), name: z.string(), is_active: z.boolean() })
const eventRow = z.object({ id: uuid, event_type: z.string(), from_status: z.string().nullable(), to_status: z.string(), actor_name: z.string(), reason: z.string().nullable(), occurred_at: z.string() })

export interface LeaveType { id: string; code: string; name: string; isPaid: boolean; defaultEntitlementDays: number | null; requiresEvidence: boolean; color: string; displayOrder: number }
export interface LeaveRequest { id: string; employeeId: string; employeeName: string | null; leaveTypeId: string; leaveTypeCode: string; leaveTypeName: string; startDate: string; endDate: string; workingDays: number; reason: string; status: 'pending'|'approved'|'rejected'|'withdrawn'|'cancelled'; source: 'employee'|'hr_on_behalf'; createdAt: string }
export interface LeaveBalance { leaveTypeId: string; leaveTypeCode: string; leaveTypeName: string; entitledDays: number; adjustmentDays: number; usedDays: number; remainingDays: number; isPaid: boolean }
export interface LeaveDocument { id: string; storagePath: string; originalFileName: string; mimeType: string; sizeBytes: number; createdAt: string }
export interface LeaveHoliday { id: string; date: string; name: string; active: boolean }
export interface LeaveEvent { id: string; type: string; fromStatus: string | null; toStatus: string; actorName: string; reason: string | null; occurredAt: string }

export function parseLeaveRequests(value: unknown): LeaveRequest[] { return z.array(requestRow).parse(value).map((row) => ({ id: row.id, employeeId: row.employee_id, employeeName: row.employee_name ?? null, leaveTypeId: row.leave_type_id, leaveTypeCode: row.leave_type_code, leaveTypeName: row.leave_type_name, startDate: row.start_date, endDate: row.end_date, workingDays: row.working_days, reason: row.reason, status: row.status, source: row.source, createdAt: row.submitted_at })) }

interface RpcResult { data: unknown; error: unknown }
export interface LeaveRpcClient { rpc(name: string, parameters?: Record<string, unknown>): PromiseLike<RpcResult> }

const exposed = new Set(['Leave dates must fall within one calendar year.', 'Leave end date cannot be before start date.', 'This leave overlaps an existing pending or approved request.', 'Evidence can only be changed while leave is pending.', 'A leave request can contain up to 10 supporting documents.', 'Supporting evidence is required before this leave can be approved.'])
function safeError(error: unknown) { const message = typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' ? error.message : ''; return new Error(exposed.has(message) ? message : 'Leave request could not be completed.') }

export interface LeaveApi {
  listTypes(): Promise<LeaveType[]>; listMine(): Promise<LeaveRequest[]>; listForHr(): Promise<LeaveRequest[]>; listBalances(employeeId: string, year: number): Promise<LeaveBalance[]>;
  submit(input: LeaveRequestInput): Promise<string>; logForEmployee(input: HrLeaveRequestInput): Promise<string>; decide(input: LeaveDecisionInput): Promise<void>; withdraw(input: LeaveReasonAction): Promise<void>; cancel(input: LeaveReasonAction): Promise<void>; adjustBalance(input: LeaveBalanceAdjustment): Promise<string>;
  listDocuments(requestId: string): Promise<LeaveDocument[]>; uploadDocuments(requestId: string, files: File[]): Promise<void>; removeDocument(document: LeaveDocument): Promise<void>; createDocumentDownload(path: string): Promise<string>;
  listHolidays?(): Promise<LeaveHoliday[]>; saveType?(input: { code: string; name: string; isPaid: boolean; defaultEntitlementDays: number | null; requiresEvidence: boolean }): Promise<string>; saveHoliday?(input: { date: string; name: string }): Promise<string>; setEntitlement?(input: { employeeId: string; leaveTypeId: string; year: number; days: number }): Promise<string>; listEvents?(requestId: string): Promise<LeaveEvent[]>;
}

export async function rollbackLeaveUploads(attached: { id: string; path: string }[], removeMetadata: (id: string) => Promise<void>) {
  for (const document of [...attached].reverse()) {
    try { await removeMetadata(document.id) } catch { /* preserve the original upload error */ }
  }
}

export function createLeaveApi(client: LeaveRpcClient = getSupabaseClient() as unknown as LeaveRpcClient): LeaveApi {
  async function rpc(name: string, parameters?: Record<string, unknown>) { const { data, error } = await client.rpc(name, parameters); if (error) throw safeError(error); return data }
  return {
    async listTypes() { return z.array(leaveTypeRow).parse(await rpc('rpc_list_leave_types')).map((row) => ({ id: row.id, code: row.code, name: row.name, isPaid: row.is_paid, defaultEntitlementDays: row.default_entitlement_days, requiresEvidence: row.requires_evidence, color: row.color, displayOrder: row.display_order })) },
    async listMine() { return parseLeaveRequests(await rpc('rpc_list_my_leave_requests')) },
    async listForHr() { return parseLeaveRequests(await rpc('rpc_list_hr_leave_requests')) },
    async listBalances(employeeId, year) { const rows = z.array(balanceRow).parse(await rpc('rpc_list_leave_balances', { p_employee_id: uuid.parse(employeeId), p_leave_year: year })); return rows.map((row) => ({ leaveTypeId: row.leave_type_id, leaveTypeCode: row.leave_type_code, leaveTypeName: row.leave_type_name, entitledDays: row.entitled_days, adjustmentDays: row.adjustment_days, usedDays: row.approved_days, remainingDays: row.remaining_days, isPaid: row.is_paid })) },
    async submit(input) { const value = leaveRequestInputSchema.parse(input); return uuid.parse(await rpc('rpc_submit_leave_request', { p_leave_type_id: value.leaveTypeId, p_start_date: value.startDate, p_end_date: value.endDate, p_reason: value.reason })) },
    async logForEmployee(input) { const value = hrLeaveRequestInputSchema.parse(input); return uuid.parse(await rpc('rpc_log_leave_for_employee', { p_employee_id: value.employeeId, p_leave_type_id: value.leaveTypeId, p_start_date: value.startDate, p_end_date: value.endDate, p_reason: value.reason })) },
    async decide(input) { const value = leaveDecisionInputSchema.parse(input); await rpc('rpc_decide_leave_request', { p_request_id: value.requestId, p_decision: value.decision, p_reason: value.reason }) },
    async withdraw(input) { const value = leaveReasonActionSchema.parse(input); await rpc('rpc_withdraw_leave_request', { p_request_id: value.requestId, p_reason: value.reason }) },
    async cancel(input) { const value = leaveReasonActionSchema.parse(input); await rpc('rpc_cancel_leave_request', { p_request_id: value.requestId, p_reason: value.reason }) },
    async adjustBalance(input) { const value = leaveBalanceAdjustmentSchema.parse(input); return uuid.parse(await rpc('rpc_adjust_leave_balance', { p_employee_id: value.employeeId, p_leave_type_id: value.leaveTypeId, p_leave_year: value.leaveYear, p_adjustment_days: value.adjustmentDays, p_reason: value.reason })) },
    async listDocuments(requestId) { return z.array(documentRow).parse(await rpc('rpc_list_leave_documents', { p_leave_request_id: uuid.parse(requestId) })).map((row) => ({ id: row.id, storagePath: row.storage_path, originalFileName: row.original_file_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: row.created_at })) },
    async uploadDocuments(requestId, files) {
      if (!files.length || files.length > 10) throw new Error('Attach between 1 and 10 supporting documents.')
      const supabase = getSupabaseClient(); const auth = await supabase.auth.getUser(); if (!auth.data.user) throw new Error('Sign in again before uploading evidence.')
      const attached: { id: string; path: string }[] = []; const uploadedPaths: string[] = []
      try { for (const file of files) { const validation = await validatePrivateFileForUpload(file); if (!validation.ok) throw new Error('Use a PDF or phone-camera image no larger than 10 MB.'); const path = createPrivateObjectPath({ ownerId: auth.data.user.id, category: 'leave-evidence', recordId: requestId, extension: validation.extension }); const stored = await supabase.storage.from('private-files').upload(path, file, { upsert: false, contentType: file.type }); if (stored.error) throw stored.error; uploadedPaths.push(path); const id = uuid.parse(await rpc('rpc_attach_leave_document', { p_leave_request_id: requestId, p_storage_path: path, p_original_file_name: file.name, p_mime_type: file.type.toLowerCase(), p_size_bytes: file.size })); attached.push({ id, path }) } }
      catch (error) { await rollbackLeaveUploads(attached, async (id) => { await rpc('rpc_remove_leave_document', { p_document_id: id }) }); if (uploadedPaths.length) await supabase.storage.from('private-files').remove(uploadedPaths); throw error }
    },
    async removeDocument(document) { const removed = await getSupabaseClient().storage.from('private-files').remove([document.storagePath]); if (removed.error) throw new Error('The supporting document could not be removed.'); await rpc('rpc_remove_leave_document', { p_document_id: document.id }) },
    async createDocumentDownload(path) { const supabase = getSupabaseClient(); return createPrivateDownloadUrl(path, { allowedOrigin: new URL(import.meta.env.VITE_SUPABASE_URL).origin, createSignedUrl: (objectPath, expiresIn) => supabase.storage.from('private-files').createSignedUrl(objectPath, expiresIn) }) },
    async listHolidays() { return z.array(holidayRow).parse(await rpc('rpc_list_public_holidays')).map((row) => ({ id: row.id, date: row.holiday_date, name: row.name, active: row.is_active })) },
    async saveType(input) { return uuid.parse(await rpc('rpc_save_leave_type', { p_code: input.code.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'), p_name: input.name.trim(), p_is_paid: input.isPaid, p_default_entitlement_days: input.defaultEntitlementDays, p_requires_evidence: input.requiresEvidence })) },
    async saveHoliday(input) { return uuid.parse(await rpc('rpc_save_public_holiday', { p_holiday_date: input.date, p_name: input.name.trim() })) },
    async setEntitlement(input) { return uuid.parse(await rpc('rpc_set_leave_entitlement', { p_employee_id: uuid.parse(input.employeeId), p_leave_type_id: uuid.parse(input.leaveTypeId), p_leave_year: input.year, p_entitled_days: input.days })) },
    async listEvents(requestId) { return z.array(eventRow).parse(await rpc('rpc_list_leave_request_events', { p_leave_request_id: uuid.parse(requestId) })).map((row) => ({ id: row.id, type: row.event_type, fromStatus: row.from_status, toStatus: row.to_status, actorName: row.actor_name, reason: row.reason, occurredAt: row.occurred_at })) },
  }
}

export const leaveApi = createLeaveApi()
