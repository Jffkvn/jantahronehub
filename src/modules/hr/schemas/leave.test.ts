import { describe, expect, it } from 'vitest'

import { leaveRequestInputSchema } from './leave'

const leaveTypeId = '11111111-1111-4111-8111-111111111111'

describe('leave request validation', () => {
  it('normalizes a valid whole-day request', () => {
    expect(leaveRequestInputSchema.parse({
      leaveTypeId,
      startDate: '2026-08-03',
      endDate: '2026-08-05',
      reason: '  Family travel  ',
    })).toEqual({ leaveTypeId, startDate: '2026-08-03', endDate: '2026-08-05', reason: 'Family travel' })
  })

  it('rejects backwards and cross-year date ranges', () => {
    expect(leaveRequestInputSchema.safeParse({ leaveTypeId, startDate: '2026-08-05', endDate: '2026-08-03', reason: 'Travel' }).success).toBe(false)
    expect(leaveRequestInputSchema.safeParse({ leaveTypeId, startDate: '2026-12-31', endDate: '2027-01-02', reason: 'Travel' }).success).toBe(false)
  })
})
