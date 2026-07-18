import { describe, expect, it } from 'vitest'

import { hrStaffAdvanceInputSchema, staffAdvanceRequestSchema } from './staffAdvances'

const employeeId = '11111111-1111-4111-8111-111111111111'

describe('staff advance validation', () => {
  it('normalizes a valid employee request', () => {
    expect(staffAdvanceRequestSchema.parse({
      amount: 1_200_000,
      reason: '  School fees  ',
      instalments: 3,
      deductionStartMonth: '2026-08-01',
    })).toEqual({ amount: 1_200_000, reason: 'School fees', instalments: 3, deductionStartMonth: '2026-08-01' })
  })

  it('requires a positive amount, 1 to 60 instalments and a first-of-month deduction date', () => {
    expect(staffAdvanceRequestSchema.safeParse({ amount: 0, reason: 'Fees', instalments: 3, deductionStartMonth: '2026-08-01' }).success).toBe(false)
    expect(staffAdvanceRequestSchema.safeParse({ amount: 100, reason: 'Fees', instalments: 61, deductionStartMonth: '2026-08-01' }).success).toBe(false)
    expect(staffAdvanceRequestSchema.safeParse({ amount: 100, reason: 'Fees', instalments: 2, deductionStartMonth: '2026-08-15' }).success).toBe(false)
  })

  it('accepts HR direct logging details after an offline discussion', () => {
    expect(hrStaffAdvanceInputSchema.parse({
      employeeId,
      amount: 600_000,
      reason: 'Emergency support',
      dateIssued: '2026-07-18',
      instalments: 2,
      deductionStartMonth: '2026-09-01',
      notes: '  Walk-in request  ',
    })).toMatchObject({ employeeId, notes: 'Walk-in request' })
  })
})
