import { describe, expect, it, vi } from 'vitest'

import { createStaffAdvancesApi, parseStaffAdvances } from './staffAdvances'

const advanceId = '11111111-1111-4111-8111-111111111111'
const employeeId = '22222222-2222-4222-8222-222222222222'

describe('Staff Advances API', () => {
  it('maps canonical advance rows', () => {
    expect(parseStaffAdvances([{
      id: advanceId,
      employee_id: employeeId,
      employee_number: 'EMP-002',
      employee_name: 'Amina',
      amount: 1_200_000,
      reason: 'School fees',
      date_issued: '2026-07-18',
      deduction_start_month: '2026-08-01',
      num_instalments: 3,
      monthly_deduction: 400_000,
      balance_remaining: 1_200_000,
      status: 'pending',
      source: 'employee',
      notes: null,
      submitted_at: '2026-07-18T10:00:00Z',
    }])[0]).toMatchObject({ employeeName: 'Amina', employeeNumber: 'EMP-002', instalments: 3, status: 'pending' })
  })

  it('maps the database paid-off state to the employee-facing settled state', () => {
    const [settled] = parseStaffAdvances([{
      id: advanceId, employee_id: employeeId, employee_name: 'Amina', amount: 1_200_000,
      reason: 'School fees', date_issued: '2026-07-18', deduction_start_month: '2026-08-01',
      num_instalments: 3, monthly_deduction: 400_000, balance_remaining: 0,
      status: 'paid_off', source: 'employee', notes: null, submitted_at: '2026-07-18T10:00:00Z',
    }])
    expect(settled.status).toBe('settled')
  })

  it('maps the UI reopen action to the canonical reactivation transition', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const api = createStaffAdvancesApi({ rpc })
    await api.transition({ advanceId, transition: 'reopened', reason: 'Issue has been resolved' })
    expect(rpc).toHaveBeenCalledWith('rpc_transition_staff_advance', {
      p_advance_id: advanceId,
      p_transition: 'reactivated',
      p_reason: 'Issue has been resolved',
    })
  })

  it('submits a normalized employee request through the canonical RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: advanceId, error: null })
    const api = createStaffAdvancesApi({ rpc })
    await api.submit({ amount: 1_200_000, reason: ' School fees ', instalments: 3, deductionStartMonth: '2026-08-01' })
    expect(rpc).toHaveBeenCalledWith('rpc_submit_staff_advance', {
      p_amount: 1_200_000,
      p_reason: 'School fees',
      p_num_instalments: 3,
      p_deduction_start_month: '2026-08-01',
    })
  })

  it('logs HR walk-in requests through the direct-entry RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: advanceId, error: null })
    const api = createStaffAdvancesApi({ rpc })
    await api.logForEmployee({ employeeId, amount: 600_000, reason: 'Emergency support', dateIssued: '2026-07-18', instalments: 2, deductionStartMonth: '2026-09-01', notes: 'Walk-in request' })
    expect(rpc).toHaveBeenCalledWith('rpc_log_staff_advance', expect.objectContaining({ p_employee_id: employeeId, p_notes: 'Walk-in request' }))
  })

  it('hides unexpected database diagnostics', async () => {
    const api = createStaffAdvancesApi({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL detail' } }) })
    await expect(api.listMine()).rejects.toThrow('Staff advance request could not be completed.')
  })
})
