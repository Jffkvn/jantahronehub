import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { EmployeeApi } from '../api/employees'
import type { LeaveApi } from '../api/leave'
import { LeaveManagementPage } from './LeaveManagementPage'

const leaveType = { id: '11111111-1111-4111-8111-111111111111', code: 'annual', name: 'Annual leave', isPaid: true, defaultEntitlementDays: 21, requiresEvidence: false, color: '#16866f', displayOrder: 1 }
const request = { id: '22222222-2222-4222-8222-222222222222', employeeId: '33333333-3333-4333-8333-333333333333', employeeName: 'Amina Nsubuga', leaveTypeId: leaveType.id, leaveTypeCode: 'annual', leaveTypeName: 'Annual leave', startDate: '2026-08-03', endDate: '2026-08-05', workingDays: 3, reason: 'Family trip', status: 'pending' as const, source: 'employee' as const, createdAt: '2026-07-17T08:00:00Z' }

function leaveApi(): LeaveApi { return { listTypes: vi.fn().mockResolvedValue([leaveType]), listMine: vi.fn(), listForHr: vi.fn().mockResolvedValue([request]), listBalances: vi.fn().mockResolvedValue([]), submit: vi.fn(), logForEmployee: vi.fn(), decide: vi.fn().mockResolvedValue(undefined), withdraw: vi.fn(), cancel: vi.fn(), adjustBalance: vi.fn(), listDocuments: vi.fn().mockResolvedValue([]), uploadDocuments: vi.fn(), removeDocument: vi.fn(), createDocumentDownload: vi.fn() } }
function employeeApi(): EmployeeApi { const employee = { id: request.employeeId, employeeNumber: 'EGY-001', legalName: 'Amina Nsubuga', companyEmail: null, workPhone: null, active: true, departmentName: 'Operations', jobTitleName: 'Coordinator', startDate: '2025-01-01', endDate: null }; return { list: vi.fn().mockResolvedValue([employee]), get: vi.fn(), setup: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), offboard: vi.fn() } }

test('shows pending requests and HR actions', async () => {
  const user = userEvent.setup()
  renderWithProviders(<LeaveManagementPage api={leaveApi()} employeesApi={employeeApi()} />)
  expect(await screen.findByRole('heading', { name: /leave management/i })).toBeInTheDocument()
  expect(await screen.findAllByText('Amina Nsubuga')).not.toHaveLength(0)
  expect(await screen.findByText('Family trip')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /^log leave$/i }))
  expect(screen.getByRole('dialog', { name: /^log leave$/i })).toBeInTheDocument()
  expect(screen.getByLabelText('Employee')).toBeInTheDocument()
})

test('logs approved leave for an employee in one HR action without uploads or a second decision', async () => {
  const user = userEvent.setup()
  const api = leaveApi()
  vi.mocked(api.logForEmployee).mockResolvedValue(request.id)
  renderWithProviders(<LeaveManagementPage api={api} employeesApi={employeeApi()} />)

  await screen.findByRole('heading', { name: /leave management/i })
  await user.click(screen.getByRole('button', { name: /^log leave$/i }))
  const dialog = screen.getByRole('dialog', { name: /^log leave$/i })
  await user.selectOptions(screen.getByRole('combobox', { name: /leave type/i }), leaveType.id)
  await user.type(screen.getByLabelText(/start date/i), '2026-09-01')
  await user.type(screen.getByLabelText(/end date/i), '2026-09-02')
  await user.type(screen.getByLabelText(/reason/i), 'Recorded after offline discussion')
  expect(screen.queryByLabelText(/supporting documents/i)).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: /^log leave$/i }))

  expect(api.logForEmployee).toHaveBeenCalled()
  expect(api.decide).not.toHaveBeenCalled()
  expect(api.uploadDocuments).not.toHaveBeenCalled()
})

test('lets HR cancel approved leave with a mandatory reason', async () => {
  const user = userEvent.setup()
  const approved = { ...request, status: 'approved' as const }
  const api = leaveApi()
  vi.mocked(api.listForHr).mockResolvedValue([approved])
  vi.mocked(api.cancel).mockResolvedValue(undefined)
  renderWithProviders(<LeaveManagementPage api={api} employeesApi={employeeApi()} />)

  await user.click(await screen.findByRole('button', { name: /^list$/i }))
  await user.click(await screen.findByRole('button', { name: /cancel annual leave for amina nsubuga/i }))
  await user.type(screen.getByLabelText(/reason for cancellation/i), 'Employee returned early')
  await user.click(screen.getByRole('button', { name: /confirm cancellation/i }))

  expect(api.cancel).toHaveBeenCalledWith({ requestId: approved.id, reason: 'Employee returned early' })
})

test('provides HR leave setup for types, holidays and employee entitlements', async () => {
  const user = userEvent.setup()
  const api = leaveApi()
  api.listHolidays = vi.fn().mockResolvedValue([])
  api.saveType = vi.fn().mockResolvedValue('44444444-4444-4444-8444-444444444444')
  api.saveHoliday = vi.fn().mockResolvedValue('55555555-5555-4555-8555-555555555555')
  api.setEntitlement = vi.fn().mockResolvedValue('66666666-6666-4666-8666-666666666666')
  renderWithProviders(<LeaveManagementPage api={api} employeesApi={employeeApi()} />)

  await user.click(await screen.findByRole('button', { name: /leave setup/i }))
  expect(screen.getByRole('dialog', { name: /leave setup/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /leave types/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /public holidays/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /employee entitlement/i })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /balance adjustment/i })).toBeInTheDocument()
})

test('opens request evidence and audit history', async () => {
  const user = userEvent.setup()
  const api = leaveApi()
  api.listEvents = vi.fn().mockResolvedValue([{ id: '77777777-7777-4777-8777-777777777777', type: 'submitted', fromStatus: null, toStatus: 'pending', actorName: 'Amina Nsubuga', reason: 'Family trip', occurredAt: '2026-07-17T08:00:00Z' }])
  renderWithProviders(<LeaveManagementPage api={api} employeesApi={employeeApi()} />)

  await user.click((await screen.findAllByRole('button', { name: /view details/i }))[0])
  expect(await screen.findByRole('heading', { name: /request history/i })).toBeInTheDocument()
  expect(screen.getAllByText('Amina Nsubuga').length).toBeGreaterThan(0)
})

test('opens the exact request addressed by a Leave notification link', async () => {
  const api = leaveApi()
  api.listEvents = vi.fn().mockResolvedValue([])

  renderWithProviders(<LeaveManagementPage api={api} employeesApi={employeeApi()} />, {
    route: `/hr/leave?request=${request.id}`,
  })

  expect(await screen.findByRole('dialog', { name: /leave request details/i })).toBeInTheDocument()
  expect(screen.getAllByText(/family trip/i).length).toBeGreaterThan(0)
})
