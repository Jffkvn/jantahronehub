import { describe, expect, it, vi } from 'vitest'

import { createLeaveApi, parseLeaveRequests } from './leave'

const requestId = '11111111-1111-4111-8111-111111111111'
const employeeId = '22222222-2222-4222-8222-222222222222'
const leaveTypeId = '33333333-3333-4333-8333-333333333333'

describe('Leave API', () => {
  it('maps canonical request rows', () => {
    expect(parseLeaveRequests([{ id: requestId, employee_id: employeeId, employee_name: 'Amina', leave_type_id: leaveTypeId, leave_type_code: 'annual', leave_type_name: 'Annual Leave', start_date: '2026-08-03', end_date: '2026-08-05', working_days: 3, reason: 'Travel', status: 'pending', source: 'employee', submitted_at: '2026-07-17T10:00:00Z' }])[0]).toMatchObject({ id: requestId, employeeName: 'Amina', workingDays: 3, status: 'pending', createdAt: '2026-07-17T10:00:00Z' })
  })

  it('maps approved days from the canonical balance RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ leave_type_id: leaveTypeId, leave_type_code: 'annual', leave_type_name: 'Annual Leave', entitled_days: 21, adjustment_days: 0, approved_days: 3, remaining_days: 18, is_paid: true }], error: null })
    const api = createLeaveApi({ rpc })
    await expect(api.listBalances(employeeId, 2026)).resolves.toEqual([expect.objectContaining({ usedDays: 3, remainingDays: 18 })])
  })

  it('submits normalized employee leave using canonical RPC parameters', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: requestId, error: null })
    const api = createLeaveApi({ rpc })
    await api.submit({ leaveTypeId, startDate: '2026-08-03', endDate: '2026-08-05', reason: ' Travel ' })
    expect(rpc).toHaveBeenCalledWith('rpc_submit_leave_request', { p_leave_type_id: leaveTypeId, p_start_date: '2026-08-03', p_end_date: '2026-08-05', p_reason: 'Travel' })
  })

  it('hides unexpected database diagnostics', async () => {
    const api = createLeaveApi({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL detail' } }) })
    await expect(api.listMine()).rejects.toThrow('Leave request could not be completed.')
  })

  it('removes uploaded document metadata in reverse order during rollback', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    const attached = [
      { id: requestId, path: `${employeeId}/leave-evidence/${requestId}/first.png` },
      { id: leaveTypeId, path: `${employeeId}/leave-evidence/${requestId}/second.png` },
    ]
    const { rollbackLeaveUploads } = await import('./leave')
    await rollbackLeaveUploads(attached, remove)
    expect(remove.mock.calls).toEqual([[leaveTypeId], [requestId]])
  })
})
