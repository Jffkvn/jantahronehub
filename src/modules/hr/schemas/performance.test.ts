import { describe, expect, it } from 'vitest'

import { performanceCycleInputSchema, performanceImportSchema, performanceReviewDraftSchema } from './performance'

const reviewId = '11111111-1111-4111-8111-111111111111'

describe('performance validation', () => {
  it('normalizes a valid cycle', () => {
    expect(performanceCycleInputSchema.parse({ name: '  Mid-year 2026 ', startDate: '2026-01-01', endDate: '2026-06-30' }))
      .toEqual({ name: 'Mid-year 2026', startDate: '2026-01-01', endDate: '2026-06-30' })
  })

  it('validates a legacy-compatible spreadsheet review row', () => {
    expect(performanceImportSchema.safeParse({ employeeId: '11111111-1111-4111-8111-111111111111', cycleId: '22222222-2222-4222-8222-222222222222', reviewerProfileId: '33333333-3333-4333-8333-333333333333', managerComments: 'Strong delivery', recommendIncrement: true, recommendPromotion: false, goals: [{ description: 'Complete rollout', managerRating: 4 }] }).success).toBe(true)
  })

  it('rejects a cycle whose end date precedes its start', () => {
    expect(performanceCycleInputSchema.safeParse({ name: 'Cycle', startDate: '2026-06-30', endDate: '2026-01-01' }).success).toBe(false)
  })

  it('normalizes KPI goals and requires ratings between one and five', () => {
    const parsed = performanceReviewDraftSchema.parse({
      reviewId,
      managerComments: '  Strong delivery  ',
      recommendIncrement: true,
      recommendPromotion: false,
      goals: [{ description: '  Deliver sites ', managerRating: 4 }],
    })
    expect(parsed.goals[0]).toEqual({ description: 'Deliver sites', managerRating: 4 })
    expect(performanceReviewDraftSchema.safeParse({ ...parsed, goals: [{ description: 'Bad rating', managerRating: 6 }] }).success).toBe(false)
  })
})
