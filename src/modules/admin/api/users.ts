import { z } from 'zod'

import { getSupabaseClient } from '../../../lib/supabase/client'

export const roleKeySchema = z.enum([
  'super_admin',
  'hr_admin',
  'employee',
  'coordinator',
  'project_manager',
  'warehouse_manager',
  'cfo',
  'managing_director',
])

const uuidSchema = z.string().uuid()
const timestampSchema = z.string().min(1)

const employeeSummarySchema = z.object({
  id: uuidSchema,
  employee_number: z.string().min(1),
  legal_name: z.string().min(1),
})

const userAccountRowSchema = z.object({
  profile_id: uuidSchema,
  display_name: z.string().min(1).max(160),
  email: z.string().email(),
  status: z.enum(['active', 'deactivated']),
  deactivated_at: timestampSchema.nullable(),
  created_at: timestampSchema,
  role_keys: z.array(roleKeySchema).min(1),
  employee: employeeSummarySchema.nullable(),
  last_access_change_at: timestampSchema.nullable(),
  can_manage: z.boolean(),
  is_self: z.boolean(),
})

const roleOptionRowSchema = z.object({
  id: uuidSchema,
  key: roleKeySchema,
  name: z.string().min(1).max(100),
  description: z.string(),
})

const employeeCandidateRowSchema = z.object({
  id: uuidSchema,
  employee_number: z.string().min(1),
  legal_name: z.string().min(1),
  linked_profile_id: uuidSchema.nullable(),
  available: z.boolean(),
})

const accessAuditRowSchema = z.object({
  id: uuidSchema,
  occurred_at: timestampSchema,
  event_type: z.enum([
    'user.connected',
    'user.access_updated',
    'user.status_changed',
  ]),
  target_profile_id: uuidSchema,
  actor_display_name: z.string().min(1).nullable(),
  target_display_name: z.string().min(1).nullable(),
  previous_values: z.record(z.string(), z.unknown()).nullable(),
  new_values: z.record(z.string(), z.unknown()).nullable(),
  reason: z.string().nullable(),
})

const accessStateRowSchema = z.object({
  profile_id: uuidSchema,
  display_name: z.string().min(1).max(160),
  email: z.string().email().optional(),
  status: z.enum(['active', 'deactivated']),
  employee_id: uuidSchema.nullable(),
  role_keys: z.array(roleKeySchema).min(1),
})

const normalizedRoleKeysSchema = z
  .array(roleKeySchema)
  .min(1, 'Select at least one role.')
  .transform((roleKeys) => [...new Set(roleKeys)])

const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Reason must contain at least 3 characters.')
  .max(500, 'Reason cannot exceed 500 characters.')

export const connectUserInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(160, 'Display name cannot exceed 160 characters.'),
  roleKeys: normalizedRoleKeysSchema,
  employeeId: uuidSchema.nullable(),
  reason: reasonSchema,
})

export const updateUserAccessInputSchema = z.object({
  profileId: uuidSchema,
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name is required.')
    .max(160, 'Display name cannot exceed 160 characters.'),
  roleKeys: normalizedRoleKeysSchema,
  employeeId: uuidSchema.nullable(),
  reason: reasonSchema,
})

export const setUserStatusInputSchema = z.object({
  profileId: uuidSchema,
  status: z.enum(['active', 'deactivated']),
  reason: reasonSchema,
})

export type RoleKey = z.infer<typeof roleKeySchema>
export type ConnectUserInput = z.input<typeof connectUserInputSchema>
export type UpdateUserAccessInput = z.input<typeof updateUserAccessInputSchema>
export type SetUserStatusInput = z.input<typeof setUserStatusInputSchema>

export interface UserAccount {
  profileId: string
  displayName: string
  email: string
  status: 'active' | 'deactivated'
  deactivatedAt: string | null
  createdAt: string
  roleKeys: RoleKey[]
  employee: {
    id: string
    employeeNumber: string
    legalName: string
  } | null
  lastAccessChangeAt: string | null
  canManage: boolean
  isSelf: boolean
}

export interface RoleOption {
  id: string
  key: RoleKey
  name: string
  description: string
}

export interface EmployeeCandidate {
  id: string
  employeeNumber: string
  legalName: string
  linkedProfileId: string | null
  available: boolean
}

export interface AccessAuditEntry {
  id: string
  occurredAt: string
  eventType: 'user.connected' | 'user.access_updated' | 'user.status_changed'
  targetProfileId: string
  actorDisplayName: string | null
  targetDisplayName: string | null
  previousValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  reason: string | null
}

export interface UserAccessState {
  profileId: string
  displayName: string
  email?: string
  status: 'active' | 'deactivated'
  employeeId: string | null
  roleKeys: RoleKey[]
}

export function parseUserAccounts(value: unknown): UserAccount[] {
  return z.array(userAccountRowSchema).parse(value).map((row) => ({
    profileId: row.profile_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    deactivatedAt: row.deactivated_at,
    createdAt: row.created_at,
    roleKeys: row.role_keys,
    employee: row.employee
      ? {
          id: row.employee.id,
          employeeNumber: row.employee.employee_number,
          legalName: row.employee.legal_name,
        }
      : null,
    lastAccessChangeAt: row.last_access_change_at,
    canManage: row.can_manage,
    isSelf: row.is_self,
  }))
}

function parseRoleOptions(value: unknown): RoleOption[] {
  return z.array(roleOptionRowSchema).parse(value)
}

function parseEmployeeCandidates(value: unknown): EmployeeCandidate[] {
  return z.array(employeeCandidateRowSchema).parse(value).map((row) => ({
    id: row.id,
    employeeNumber: row.employee_number,
    legalName: row.legal_name,
    linkedProfileId: row.linked_profile_id,
    available: row.available,
  }))
}

function parseAccessAudit(value: unknown): AccessAuditEntry[] {
  return z.array(accessAuditRowSchema).parse(value).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    eventType: row.event_type,
    targetProfileId: row.target_profile_id,
    actorDisplayName: row.actor_display_name,
    targetDisplayName: row.target_display_name,
    previousValues: row.previous_values,
    newValues: row.new_values,
    reason: row.reason,
  }))
}

function parseAccessState(value: unknown): UserAccessState {
  const row = accessStateRowSchema.parse(value)
  return {
    profileId: row.profile_id,
    displayName: row.display_name,
    email: row.email,
    status: row.status,
    employeeId: row.employee_id,
    roleKeys: row.role_keys,
  }
}

interface RpcResult {
  data: unknown
  error: unknown
}

export interface UserAdministrationRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): PromiseLike<RpcResult>
}

const exposedDatabaseMessages = new Set([
  'users.read permission is required',
  'users.manage permission is required',
  'HR administrators cannot assign or manage super_admin',
  'at least one role is required',
  'one or more role keys are invalid',
  'reason must contain between 3 and 500 characters',
  'a valid email address is required',
  'display name must contain between 1 and 160 characters',
  'no existing Auth user matches that email address',
  'that Auth user is already connected to OneHub',
  'employee link candidate does not exist',
  'employee is already linked to another account',
  'user profile does not exist',
  'at least one active super_admin account must remain',
  'account status must be active or deactivated',
  'account already has the requested status',
  'audit result limit must be between 1 and 100',
])

function safeRequestError(error: unknown): Error {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    exposedDatabaseMessages.has(error.message)
  ) {
    return new Error(error.message)
  }

  return new Error('User administration request could not be completed.')
}

export interface UserAdministrationApi {
  listUsers(): Promise<UserAccount[]>
  listRoles(): Promise<RoleOption[]>
  listEmployees(): Promise<EmployeeCandidate[]>
  listAudit(limit?: number): Promise<AccessAuditEntry[]>
  connectUser(input: ConnectUserInput): Promise<UserAccessState>
  updateAccess(input: UpdateUserAccessInput): Promise<UserAccessState>
  setStatus(input: SetUserStatusInput): Promise<UserAccessState>
}

export function createUserAdministrationApi(
  client: UserAdministrationRpcClient =
    getSupabaseClient() as unknown as UserAdministrationRpcClient,
): UserAdministrationApi {
  async function rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await client.rpc(functionName, parameters)
    if (error) throw safeRequestError(error)
    return data
  }

  return {
    async listUsers() {
      return parseUserAccounts(await rpc('admin_list_user_accounts'))
    },
    async listRoles() {
      return parseRoleOptions(await rpc('admin_list_assignable_roles'))
    },
    async listEmployees() {
      return parseEmployeeCandidates(
        await rpc('admin_list_employee_candidates'),
      )
    },
    async listAudit(limit = 50) {
      return parseAccessAudit(
        await rpc('admin_list_access_audit', { result_limit: limit }),
      )
    },
    async connectUser(input) {
      const parsed = connectUserInputSchema.parse(input)
      return parseAccessState(
        await rpc('admin_connect_existing_user', {
          target_email: parsed.email,
          target_display_name: parsed.displayName,
          target_role_keys: parsed.roleKeys,
          target_employee_id: parsed.employeeId,
          change_reason: parsed.reason,
        }),
      )
    },
    async updateAccess(input) {
      const parsed = updateUserAccessInputSchema.parse(input)
      return parseAccessState(
        await rpc('admin_update_user_access', {
          target_profile_id: parsed.profileId,
          target_display_name: parsed.displayName,
          target_role_keys: parsed.roleKeys,
          target_employee_id: parsed.employeeId,
          change_reason: parsed.reason,
        }),
      )
    },
    async setStatus(input) {
      const parsed = setUserStatusInputSchema.parse(input)
      return parseAccessState(
        await rpc('admin_set_user_status', {
          target_profile_id: parsed.profileId,
          target_status: parsed.status,
          change_reason: parsed.reason,
        }),
      )
    },
  }
}

function defaultApi() {
  return createUserAdministrationApi()
}

export const userAdministrationApi: UserAdministrationApi = {
  listUsers: () => defaultApi().listUsers(),
  listRoles: () => defaultApi().listRoles(),
  listEmployees: () => defaultApi().listEmployees(),
  listAudit: (limit) => defaultApi().listAudit(limit),
  connectUser: (input) => defaultApi().connectUser(input),
  updateAccess: (input) => defaultApi().updateAccess(input),
  setStatus: (input) => defaultApi().setStatus(input),
}
