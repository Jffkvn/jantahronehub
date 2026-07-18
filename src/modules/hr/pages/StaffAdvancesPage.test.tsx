import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { EmployeeApi } from '../api/employees'
import type { StaffAdvance, StaffAdvancesApi } from '../api/staffAdvances'
import { StaffAdvancesPage } from './StaffAdvancesPage'

const advance: StaffAdvance = { id: '11111111-1111-4111-8111-111111111111', employeeId: '22222222-2222-4222-8222-222222222222', employeeNumber: 'EGY-001', employeeName: 'Amina Nsubuga', amount: 1_200_000, reason: 'School fees', dateIssued: '2026-07-18', deductionStartMonth: '2026-08-01', instalments: 3, monthlyDeduction: 400_000, balanceRemaining: 1_200_000, status: 'pending', source: 'employee', notes: null, createdAt: '2026-07-18T10:00:00Z' }
function advancesApi(): StaffAdvancesApi { return { listMine: vi.fn(), listForHr: vi.fn().mockResolvedValue([advance]), listEvents: vi.fn().mockResolvedValue([]), submit: vi.fn(), logForEmployee: vi.fn().mockResolvedValue(advance.id), decide: vi.fn().mockResolvedValue(undefined), recordRepayment: vi.fn(), transition: vi.fn() } }
function employeesApi(): EmployeeApi { return { list: vi.fn().mockResolvedValue([{ id: advance.employeeId, employeeNumber: 'EGY-001', legalName: 'Amina Nsubuga', companyEmail: null, workPhone: null, active: true, departmentName: 'Operations', jobTitleName: 'Coordinator', payGradeName: null, startDate: '2025-01-01', endDate: null }]), get: vi.fn(), setup: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), offboard: vi.fn() } }

test('shows requests, decisions and HR direct logging', async () => {
  const user = userEvent.setup()
  const api = advancesApi()
  renderWithProviders(<StaffAdvancesPage api={api} employeesApi={employeesApi()} />)
  expect(await screen.findByRole('heading', { name: /staff advances/i })).toBeInTheDocument()
  expect((await screen.findAllByText('Amina Nsubuga')).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /log advance/i }))
  const dialog = screen.getByRole('dialog', { name: /log staff advance/i })
  expect(within(dialog).getByLabelText(/employee/i)).toBeInTheDocument()
})

test('approves an employee request with an auditable HR reason', async () => {
  const user = userEvent.setup()
  const api = advancesApi()
  renderWithProviders(<StaffAdvancesPage api={api} employeesApi={employeesApi()} />)
  await user.click(await screen.findByRole('button', { name: /^approve$/i }))
  expect(api.decide).toHaveBeenCalledWith({ advanceId: advance.id, decision: 'approved', reason: 'Approved by HR' })
})

test('opens the request addressed by a notification link', async () => {
  renderWithProviders(<StaffAdvancesPage api={advancesApi()} employeesApi={employeesApi()} />, { route: `/hr/staff-advances?advance=${advance.id}` })
  expect(await screen.findByRole('dialog', { name: /staff advance details/i })).toBeInTheDocument()
})

test('records an auditable correction to an active advance', async () => {
  const user = userEvent.setup()
  const api = advancesApi()
  vi.mocked(api.listForHr).mockResolvedValue([{ ...advance, status: 'active' }])
  renderWithProviders(<StaffAdvancesPage api={api} employeesApi={employeesApi()} />)
  await user.click(await screen.findByRole('button', { name: /flag advance/i }))
  const dialog = screen.getByRole('dialog', { name: /flag staff advance/i })
  await user.type(within(dialog).getByLabelText(/reason/i), 'Employee is leaving')
  await user.click(within(dialog).getByRole('button', { name: /^flag advance$/i }))
  expect(api.transition).toHaveBeenCalledWith({
    advanceId: advance.id,
    transition: 'flagged',
    reason: 'Employee is leaving',
  })
})
