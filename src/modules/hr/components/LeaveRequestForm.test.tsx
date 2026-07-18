import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { LeaveRequestForm } from './LeaveRequestForm'

const leaveType = { id: '11111111-1111-4111-8111-111111111111', code: 'annual', name: 'Annual Leave', isPaid: true, defaultEntitlementDays: 21, requiresEvidence: false, color: '#128f76', displayOrder: 1 }

test('submits a whole-day leave request with normalized values', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  renderWithProviders(<LeaveRequestForm leaveTypes={[leaveType]} onSubmit={onSubmit} />)

  await user.selectOptions(screen.getByRole('combobox', { name: /leave type/i }), leaveType.id)
  await user.type(screen.getByLabelText(/start date/i), '2026-08-03')
  await user.type(screen.getByLabelText(/end date/i), '2026-08-05')
  await user.type(screen.getByLabelText(/reason/i), 'Family travel')
  await user.click(screen.getByRole('button', { name: /submit leave request/i }))

  expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ leaveTypeId: leaveType.id, startDate: '2026-08-03', endDate: '2026-08-05', reason: 'Family travel', files: [] }))
})

test('accepts up to ten private phone-camera photos and PDFs', () => {
  renderWithProviders(<LeaveRequestForm leaveTypes={[leaveType]} onSubmit={vi.fn()} />)
  const input = screen.getByLabelText(/supporting documents/i)
  expect(input).toHaveAttribute('multiple')
  expect(input).toHaveAttribute('accept', 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,.heic,.heif')
})

test('requires a private document when the selected leave type requires evidence', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  const sickType = { ...leaveType, id: '22222222-2222-4222-8222-222222222222', code: 'sick', name: 'Sick Leave', requiresEvidence: true }
  renderWithProviders(<LeaveRequestForm leaveTypes={[sickType]} onSubmit={onSubmit} />)

  await user.selectOptions(screen.getByRole('combobox', { name: /leave type/i }), sickType.id)
  await user.type(screen.getByLabelText(/start date/i), '2026-08-03')
  await user.type(screen.getByLabelText(/end date/i), '2026-08-05')
  await user.type(screen.getByLabelText(/reason/i), 'Medical recovery')
  await user.click(screen.getByRole('button', { name: /submit leave request/i }))

  expect(await screen.findByText(/supporting evidence is required/i)).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()
})
