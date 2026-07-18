import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { LeaveApi } from '../../hr/api/leave'
import { MyLeavePage } from './MyLeavePage'

const leaveType = { id: '11111111-1111-4111-8111-111111111111', code: 'annual', name: 'Annual leave', isPaid: true, defaultEntitlementDays: 21, requiresEvidence: false, color: '#16866f', displayOrder: 1 }
const request = { id: '22222222-2222-4222-8222-222222222222', employeeId: '33333333-3333-4333-8333-333333333333', employeeName: 'Amina Nsubuga', leaveTypeId: leaveType.id, leaveTypeCode: 'annual', leaveTypeName: 'Annual leave', startDate: '2026-08-03', endDate: '2026-08-05', workingDays: 3, reason: 'Family trip', status: 'pending' as const, source: 'employee' as const, createdAt: '2026-07-17T08:00:00Z' }

function createApi(): LeaveApi {
  return { listTypes: vi.fn().mockResolvedValue([leaveType]), listMine: vi.fn().mockResolvedValue([request]), listForHr: vi.fn(), listBalances: vi.fn().mockResolvedValue([{ leaveTypeId: leaveType.id, leaveTypeCode: 'annual', leaveTypeName: 'Annual leave', entitledDays: 21, adjustmentDays: 0, usedDays: 0, remainingDays: 21, isPaid: true }]), submit: vi.fn().mockResolvedValue(request.id), logForEmployee: vi.fn(), decide: vi.fn(), withdraw: vi.fn(), cancel: vi.fn(), adjustBalance: vi.fn(), listDocuments: vi.fn().mockResolvedValue([]), uploadDocuments: vi.fn(), removeDocument: vi.fn(), createDocumentDownload: vi.fn() }
}

test('shows balances and lets an employee open the leave request form', async () => {
  const user = userEvent.setup()
  renderWithProviders(<MyLeavePage employeeId={request.employeeId} api={createApi()} />)

  expect(await screen.findByRole('heading', { name: /my leave/i })).toBeInTheDocument()
  expect(await screen.findByText('21')).toBeInTheDocument()
  expect(await screen.findByText('Family trip')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /request leave/i }))
  expect(screen.getByRole('dialog', { name: /request leave/i })).toBeInTheDocument()
  expect(screen.getByLabelText(/supporting documents/i)).toHaveAttribute('multiple')
})

test('lets an employee withdraw a pending request with a reason', async () => {
  const user = userEvent.setup()
  const api = createApi()
  vi.mocked(api.withdraw).mockResolvedValue(undefined)
  renderWithProviders(<MyLeavePage employeeId={request.employeeId} api={api} />)

  await user.click(await screen.findByRole('button', { name: /withdraw annual leave/i }))
  await user.type(screen.getByLabelText(/reason for withdrawal/i), 'Plans changed')
  await user.click(screen.getByRole('button', { name: /confirm withdrawal/i }))

  expect(api.withdraw).toHaveBeenCalledWith({ requestId: request.id, reason: 'Plans changed' })
})

test('opens the exact employee request addressed by a Leave notification link', async () => {
  renderWithProviders(<MyLeavePage employeeId={request.employeeId} api={createApi()} />, {
    route: `/my/leave?request=${request.id}`,
  })

  expect(await screen.findByRole('dialog', { name: /leave request details/i })).toBeInTheDocument()
  expect(screen.getAllByText(/family trip/i).length).toBeGreaterThan(0)
})

test('withdraws a newly created request when its supporting upload fails', async () => {
  const user = userEvent.setup()
  const api = createApi()
  vi.mocked(api.uploadDocuments).mockRejectedValue(new Error('Upload failed'))
  vi.mocked(api.withdraw).mockResolvedValue(undefined)
  renderWithProviders(<MyLeavePage employeeId={request.employeeId} api={api} />)

  await user.click(await screen.findByRole('button', { name: /request leave/i }))
  await user.selectOptions(screen.getByRole('combobox', { name: /leave type/i }), leaveType.id)
  await user.type(screen.getByLabelText(/start date/i), '2026-09-01')
  await user.type(screen.getByLabelText(/end date/i), '2026-09-02')
  await user.type(screen.getByLabelText(/reason/i), 'Family commitment')
  await user.upload(screen.getByLabelText(/supporting documents/i), new File(['photo'], 'phone-photo.jpg', { type: 'image/jpeg' }))
  await user.click(screen.getByRole('button', { name: /submit leave request/i }))

  expect(await screen.findByText('Upload failed')).toBeInTheDocument()
  expect(api.withdraw).toHaveBeenCalledWith({
    requestId: request.id,
    reason: 'Supporting document upload failed; request withdrawn automatically.',
  })
})
