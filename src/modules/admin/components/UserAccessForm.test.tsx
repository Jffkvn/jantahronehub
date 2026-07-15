import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { RoleOption } from '../api/users'
import { UserAccessForm } from './UserAccessForm'

const roles: RoleOption[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    key: 'super_admin',
    name: 'Super administrator',
    description: 'Owner and support administration.',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    key: 'hr_admin',
    name: 'HR administrator',
    description: 'Employee and payroll operations.',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    key: 'employee',
    name: 'Employee',
    description: 'Employee self-service.',
  },
]

describe('UserAccessForm', () => {
  it('renders only the role options authorized by the database', () => {
    renderWithProviders(
      <UserAccessForm
        mode="connect"
        roles={roles.filter((role) => role.key !== 'super_admin')}
        employees={[]}
        onSubmit={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('checkbox', { name: /super administrator/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: /hr administrator/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /^employee/i })).toBeInTheDocument()
  })

  it('requires an exact email, display name, role, and audit reason', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderWithProviders(
      <UserAccessForm
        mode="connect"
        roles={roles}
        employees={[]}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole('button', { name: /connect account/i }))

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
    expect(screen.getByText(/display name is required/i)).toBeInTheDocument()
    expect(screen.getByText(/select at least one role/i)).toBeInTheDocument()
    expect(screen.getByText(/reason must contain at least 3/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits normalized access values and an optional employee link', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    renderWithProviders(
      <UserAccessForm
        mode="connect"
        roles={roles}
        employees={[
          {
            id: '44444444-4444-4444-8444-444444444444',
            employeeNumber: 'EGY-004',
            legalName: 'Amina Nsubuga',
            linkedProfileId: null,
            available: true,
          },
        ]}
        onSubmit={onSubmit}
      />,
    )

    await user.type(screen.getByLabelText(/auth user email/i), ' Dora@Example.COM ')
    await user.type(screen.getByLabelText(/display name/i), ' Dora HR ')
    await user.click(screen.getByRole('checkbox', { name: /hr administrator/i }))
    await user.selectOptions(
      screen.getByLabelText(/employee link/i),
      '44444444-4444-4444-8444-444444444444',
    )
    await user.type(
      screen.getByLabelText(/reason for access change/i),
      ' Establish the first HR account ',
    )
    await user.click(screen.getByRole('button', { name: /connect account/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        email: 'dora@example.com',
        displayName: 'Dora HR',
        roleKeys: ['hr_admin'],
        employeeId: '44444444-4444-4444-8444-444444444444',
        reason: 'Establish the first HR account',
      }),
    )
  })
})
