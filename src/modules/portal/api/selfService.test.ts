import { beforeEach, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const is = vi.fn(() => ({ maybeSingle }))
  const eq = vi.fn(() => ({ is }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  const getSession = vi.fn()

  return {
    client: { auth: { getSession }, from, rpc },
    getSession,
    maybeSingle,
    rpc,
    select,
  }
})

vi.mock('../../../lib/supabase/client', () => ({
  getSupabaseClient: () => mocks.client,
}))

import { selfServiceApi } from './selfService'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'profile-1' } } },
    error: null,
  })
  mocks.maybeSingle.mockResolvedValue({
    data: {
      id: 'employee-1',
      employee_number: 'EGY-001',
      legal_name: 'Amina Nsubuga',
      company_email: 'amina@example.test',
      personal_email: null,
      work_phone: null,
      archived_at: null,
      employment_periods: [
        {
          start_date: '2026-01-01',
          end_date: null,
          employment_type: 'full_time',
          contract_type: 'permanent',
          probation_end_date: null,
          probation_status: 'passed',
          departments: { name: 'Operations' },
          job_titles: { name: 'Technician' },
        },
      ],
    },
    error: null,
  })
  mocks.rpc.mockResolvedValue({ data: 'Grade One', error: null })
})

test('loads only the signed-in employee pay-grade name through the protected RPC', async () => {
  const profile = await selfServiceApi.getProfile()

  expect(mocks.rpc).toHaveBeenCalledWith('get_my_pay_grade_name')
  expect(mocks.select).toHaveBeenCalledWith(expect.not.stringContaining('pay_grades'))
  expect(profile?.payGradeName).toBe('Grade One')
})
