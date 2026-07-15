import { describe, expect, it, vi } from 'vitest'

import {
  connectUserInputSchema,
  createUserAdministrationApi,
  parseUserAccounts,
  updateUserAccessInputSchema,
} from './users'

const profileId = '11111111-1111-4111-8111-111111111111'
const roleId = '22222222-2222-4222-8222-222222222222'
const employeeId = '33333333-3333-4333-8333-333333333333'

describe('user administration data parsing', () => {
  it('maps the sanitized RPC account shape into the application model', () => {
    expect(
      parseUserAccounts([
        {
          profile_id: profileId,
          display_name: 'Dora HR',
          email: 'dora@example.com',
          status: 'active',
          deactivated_at: null,
          created_at: '2026-07-14T08:00:00+00:00',
          role_keys: ['hr_admin'],
          employee: {
            id: employeeId,
            employee_number: 'EGY-002',
            legal_name: 'Dora Agai',
          },
          last_access_change_at: '2026-07-14T08:05:00+00:00',
          can_manage: true,
          is_self: false,
        },
      ]),
    ).toEqual([
      {
        profileId,
        displayName: 'Dora HR',
        email: 'dora@example.com',
        status: 'active',
        deactivatedAt: null,
        createdAt: '2026-07-14T08:00:00+00:00',
        roleKeys: ['hr_admin'],
        employee: {
          id: employeeId,
          employeeNumber: 'EGY-002',
          legalName: 'Dora Agai',
        },
        lastAccessChangeAt: '2026-07-14T08:05:00+00:00',
        canManage: true,
        isSelf: false,
      },
    ])
  })

  it('rejects malformed RPC data instead of trusting it', () => {
    expect(() =>
      parseUserAccounts([
        {
          profile_id: 'not-a-uuid',
          display_name: 'Unsafe row',
          email: 'not-an-email',
          status: 'owner',
          role_keys: ['root'],
        },
      ]),
    ).toThrow()
  })
})

describe('user administration input validation', () => {
  it('normalizes exact email, display name, role duplicates, and reason', () => {
    const result = connectUserInputSchema.parse({
      email: '  Dora@Example.COM ',
      displayName: '  Dora HR  ',
      roleKeys: ['hr_admin', 'hr_admin'],
      employeeId: null,
      reason: '  Establish the HR administrator  ',
    })

    expect(result).toEqual({
      email: 'dora@example.com',
      displayName: 'Dora HR',
      roleKeys: ['hr_admin'],
      employeeId: null,
      reason: 'Establish the HR administrator',
    })
  })

  it('rejects an account with no roles before an RPC call', () => {
    const result = updateUserAccessInputSchema.safeParse({
      profileId,
      displayName: 'Dora HR',
      roleKeys: [],
      employeeId: null,
      reason: 'Attempt an empty assignment',
    })

    expect(result.success).toBe(false)
  })
})

describe('user administration RPC adapter', () => {
  it('sends normalized values using the database function parameter names', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        profile_id: profileId,
        display_name: 'Dora HR',
        email: 'dora@example.com',
        status: 'active',
        employee_id: null,
        role_keys: ['hr_admin'],
      },
      error: null,
    })
    const api = createUserAdministrationApi({ rpc })

    await api.connectUser({
      email: ' Dora@Example.COM ',
      displayName: ' Dora HR ',
      roleKeys: ['hr_admin'],
      employeeId: null,
      reason: ' Establish HR access ',
    })

    expect(rpc).toHaveBeenCalledWith('admin_connect_existing_user', {
      target_email: 'dora@example.com',
      target_display_name: 'Dora HR',
      target_role_keys: ['hr_admin'],
      target_employee_id: null,
      change_reason: 'Establish HR access',
    })
  })

  it('returns a safe message rather than leaking an unexpected database error', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'internal query included auth.users encrypted_password',
        details: 'secret diagnostic payload',
      },
    })
    const api = createUserAdministrationApi({ rpc })

    await expect(api.listUsers()).rejects.toThrow(
      'User administration request could not be completed.',
    )
  })

  it('accepts only valid role option rows returned by the RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: roleId,
          key: 'hr_admin',
          name: 'HR administrator',
          description: 'Employee and payroll operations.',
        },
      ],
      error: null,
    })
    const api = createUserAdministrationApi({ rpc })

    await expect(api.listRoles()).resolves.toEqual([
      {
        id: roleId,
        key: 'hr_admin',
        name: 'HR administrator',
        description: 'Employee and payroll operations.',
      },
    ])
  })
})
