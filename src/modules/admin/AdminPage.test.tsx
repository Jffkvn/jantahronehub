import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../test/render'
import type {
  UserAccount,
  UserAdministrationApi,
} from './api/users'
import { AdminPage } from './AdminPage'

const accounts: UserAccount[] = [
  {
    profileId: '11111111-1111-4111-8111-111111111111',
    displayName: 'JantaHR Super Admin',
    email: 'owner@example.com',
    status: 'active',
    deactivatedAt: null,
    createdAt: '2026-07-10T08:00:00+00:00',
    roleKeys: ['super_admin'],
    employee: null,
    lastAccessChangeAt: null,
    canManage: false,
    isSelf: false,
  },
  {
    profileId: '22222222-2222-4222-8222-222222222222',
    displayName: 'Dora HR',
    email: 'dora@example.com',
    status: 'active',
    deactivatedAt: null,
    createdAt: '2026-07-11T08:00:00+00:00',
    roleKeys: ['hr_admin'],
    employee: {
      id: '33333333-3333-4333-8333-333333333333',
      employeeNumber: 'EGY-002',
      legalName: 'Dora Agai',
    },
    lastAccessChangeAt: '2026-07-14T09:00:00+00:00',
    canManage: true,
    isSelf: true,
  },
  {
    profileId: '44444444-4444-4444-8444-444444444444',
    displayName: 'Test Employee',
    email: 'employee@example.com',
    status: 'deactivated',
    deactivatedAt: '2026-07-14T10:00:00+00:00',
    createdAt: '2026-07-12T08:00:00+00:00',
    roleKeys: ['employee'],
    employee: null,
    lastAccessChangeAt: '2026-07-14T10:00:00+00:00',
    canManage: true,
    isSelf: false,
  },
]

function createApi(overrides: Partial<UserAdministrationApi> = {}): UserAdministrationApi {
  return {
    listUsers: vi.fn().mockResolvedValue(accounts),
    listRoles: vi.fn().mockResolvedValue([
      {
        id: '55555555-5555-4555-8555-555555555555',
        key: 'hr_admin',
        name: 'HR administrator',
        description: 'Employee and payroll operations.',
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        key: 'employee',
        name: 'Employee',
        description: 'Employee self-service.',
      },
    ]),
    listEmployees: vi.fn().mockResolvedValue([]),
    listAudit: vi.fn().mockResolvedValue([]),
    connectUser: vi.fn().mockResolvedValue({
      profileId: '77777777-7777-4777-8777-777777777777',
      displayName: 'New HR',
      email: 'new.hr@example.com',
      status: 'active',
      employeeId: null,
      roleKeys: ['hr_admin'],
    }),
    updateAccess: vi.fn().mockResolvedValue({
      profileId: accounts[1].profileId,
      displayName: accounts[1].displayName,
      status: 'active',
      employeeId: accounts[1].employee?.id ?? null,
      roleKeys: ['hr_admin'],
    }),
    setStatus: vi.fn().mockResolvedValue({
      profileId: accounts[2].profileId,
      displayName: accounts[2].displayName,
      status: 'active',
      employeeId: null,
      roleKeys: ['employee'],
    }),
    ...overrides,
  }
}

describe('AdminPage', () => {
  it('presents account metrics, filters, and the protected super-admin row', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AdminPage api={createApi()} />)

    expect(
      await screen.findByRole('heading', { name: /user & access administration/i }),
    ).toBeInTheDocument()
    await screen.findByText('Dora HR')
    expect(screen.getByLabelText('Active accounts')).toHaveTextContent('2')
    expect(screen.getByLabelText('Deactivated accounts')).toHaveTextContent('1')
    expect(screen.getByLabelText('Unlinked accounts')).toHaveTextContent('2')

    const superRow = screen.getByRole('row', { name: /jantaHR super admin/i })
    expect(within(superRow).getByText('Protected')).toBeInTheDocument()
    expect(
      within(superRow).queryByRole('button', { name: /edit access/i }),
    ).not.toBeInTheDocument()

    const deactivatedRow = screen.getByRole('row', { name: /test employee/i })
    expect(within(deactivatedRow).getByText('Deactivated')).toBeInTheDocument()
    expect(within(deactivatedRow).getByText('Unlinked')).toBeInTheDocument()

    await user.type(
      screen.getByRole('searchbox', { name: /search user accounts/i }),
      'test employee',
    )
    expect(screen.queryByText('Dora HR')).not.toBeInTheDocument()
    expect(screen.getByText('Test Employee')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/account status/i), 'active')
    expect(screen.getByText(/no accounts match/i)).toBeInTheDocument()

    await user.clear(screen.getByRole('searchbox', { name: /search user accounts/i }))
    await user.selectOptions(screen.getByLabelText(/account status/i), 'all')
    await user.selectOptions(screen.getByLabelText(/account role/i), 'hr_admin')
    expect(screen.getByText('Dora HR')).toBeInTheDocument()
    expect(screen.queryByText('Test Employee')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/account role/i), 'all')
    await user.selectOptions(screen.getByLabelText(/employee link/i), 'linked')
    expect(screen.getByText('Dora HR')).toBeInTheDocument()
    expect(screen.queryByText('JantaHR Super Admin')).not.toBeInTheDocument()
  })

  it('shows loading and empty directory states without inventing accounts', async () => {
    let resolveAccounts: ((value: UserAccount[]) => void) | undefined
    const pendingAccounts = new Promise<UserAccount[]>((resolve) => {
      resolveAccounts = resolve
    })

    renderWithProviders(
      <AdminPage
        api={createApi({
          listUsers: vi.fn().mockReturnValue(pendingAccounts),
        })}
      />,
    )

    expect(await screen.findByText(/loading user accounts/i)).toBeInTheDocument()
    resolveAccounts?.([])
    expect(await screen.findByText(/no accounts match/i)).toBeInTheDocument()
    expect(screen.getByText(/0 of 0 accounts/i)).toBeInTheDocument()
  })

  it('connects an existing Auth user and refreshes the directory', async () => {
    const user = userEvent.setup()
    const api = createApi()
    renderWithProviders(<AdminPage api={api} />)

    await screen.findByText('Dora HR')
    await user.click(screen.getByRole('button', { name: /connect auth user/i }))
    await user.type(screen.getByLabelText(/auth user email/i), 'new.hr@example.com')
    await user.type(screen.getByLabelText(/display name/i), 'New HR')
    await user.click(screen.getByRole('checkbox', { name: /hr administrator/i }))
    await user.type(
      screen.getByLabelText(/reason for access change/i),
      'Create a role-by-role acceptance account',
    )
    await user.click(screen.getByRole('button', { name: /connect account/i }))

    await waitFor(() => expect(api.connectUser).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /connect existing auth user/i }),
      ).not.toBeInTheDocument(),
    )
    expect(api.listUsers).toHaveBeenCalledTimes(2)
    expect(api.listAudit).toHaveBeenCalledTimes(2)
  })

  it('requires reasons for editing and status changes, then refreshes audit data', async () => {
    const user = userEvent.setup()
    const api = createApi()
    renderWithProviders(<AdminPage api={api} />)

    await screen.findByText('Dora HR')
    await user.click(
      screen.getByRole('button', { name: /edit access for dora hr/i }),
    )

    const editDialog = screen.getByRole('dialog', { name: /edit access · dora hr/i })
    const displayName = within(editDialog).getByLabelText(/display name/i)
    await user.clear(displayName)
    await user.type(displayName, 'Dora HR Lead')
    await user.type(
      within(editDialog).getByLabelText(/reason for access change/i),
      'Confirm expanded HR responsibilities',
    )
    await user.click(
      within(editDialog).getByRole('button', { name: /save access changes/i }),
    )

    await waitFor(() =>
      expect(api.updateAccess).toHaveBeenCalledWith({
        profileId: accounts[1].profileId,
        displayName: 'Dora HR Lead',
        roleKeys: ['hr_admin'],
        employeeId: accounts[1].employee?.id,
        reason: 'Confirm expanded HR responsibilities',
      }, expect.anything()),
    )
    await waitFor(() => expect(api.listAudit).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('button', { name: /deactivate dora hr/i }))
    const deactivateDialog = screen.getByRole('dialog', { name: /deactivate account/i })
    await user.click(
      within(deactivateDialog).getByRole('button', { name: /deactivate account/i }),
    )
    expect(
      await within(deactivateDialog).findByText(/reason must contain at least 3/i),
    ).toBeInTheDocument()

    const statusReasonField = within(deactivateDialog).getByLabelText(
      /reason for status change/i,
    )
    await user.type(statusReasonField, 'Temporary access suspension')
    expect(statusReasonField).toHaveValue('Temporary access suspension')
    await user.click(
      within(deactivateDialog).getByRole('button', { name: /deactivate account/i }),
    )

    await waitFor(() =>
      expect(api.setStatus).toHaveBeenCalledWith({
        profileId: accounts[1].profileId,
        status: 'deactivated',
        reason: 'Temporary access suspension',
      }, expect.anything()),
    )
    await waitFor(() => expect(api.listAudit).toHaveBeenCalledTimes(3))

    await user.click(
      screen.getByRole('button', { name: /reactivate test employee/i }),
    )
    const reactivateDialog = screen.getByRole('dialog', { name: /reactivate account/i })
    expect(
      within(reactivateDialog).getByText(/will regain the permissions/i),
    ).toBeInTheDocument()
  })

  it('shows a restrained recovery state when the account directory fails', async () => {
    renderWithProviders(
      <AdminPage
        api={createApi({
          listUsers: vi.fn().mockRejectedValue(
            new Error('User administration request could not be completed.'),
          ),
        })}
      />,
    )

    expect(
      await screen.findByText(/user accounts could not be loaded/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/auth\.users/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })
})
