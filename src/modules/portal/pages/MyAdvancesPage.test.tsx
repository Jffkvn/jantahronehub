import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { StaffAdvance, StaffAdvancesApi } from '../../hr/api/staffAdvances'
import { MyAdvancesPage } from './MyAdvancesPage'

const advance: StaffAdvance = { id: '11111111-1111-4111-8111-111111111111', employeeId: '22222222-2222-4222-8222-222222222222', employeeNumber: null, employeeName: 'Amina Nsubuga', amount: 1_200_000, reason: 'School fees', dateIssued: '2026-07-18', deductionStartMonth: '2026-08-01', instalments: 3, monthlyDeduction: 400_000, balanceRemaining: 800_000, status: 'active', source: 'employee', notes: null, createdAt: '2026-07-18T10:00:00Z' }
function api(): StaffAdvancesApi { return { listMine: vi.fn().mockResolvedValue([advance]), listForHr: vi.fn(), listEvents: vi.fn().mockResolvedValue([]), submit: vi.fn().mockResolvedValue(advance.id), logForEmployee: vi.fn(), decide: vi.fn(), recordRepayment: vi.fn(), transition: vi.fn() } }

test('shows the employee balance and prevents a duplicate open request', async () => {
  renderWithProviders(<MyAdvancesPage api={api()} />)
  expect(await screen.findByRole('heading', { name: /my staff advances/i })).toBeInTheDocument()
  expect(await screen.findByText('School fees')).toBeInTheDocument()
  expect(screen.getAllByText(/800,000/).length).toBeGreaterThan(0)
  expect(screen.getByRole('button', { name: /request advance/i })).toBeDisabled()
})

test('opens the request form when the employee has no open advance', async () => {
  const user = userEvent.setup()
  const requestApi = api()
  vi.mocked(requestApi.listMine).mockResolvedValue([])
  renderWithProviders(<MyAdvancesPage api={requestApi} />)
  await screen.findByText(/no staff advances yet/i)
  await user.click(screen.getByRole('button', { name: /request advance/i }))
  expect(screen.getByRole('dialog', { name: /request staff advance/i })).toBeInTheDocument()
})

test('opens an advance addressed by a notification link', async () => {
  renderWithProviders(<MyAdvancesPage api={api()} />, { route: `/my/advances?advance=${advance.id}` })
  expect(await screen.findByRole('dialog', { name: /staff advance details/i })).toBeInTheDocument()
})
