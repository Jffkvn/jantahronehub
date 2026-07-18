import { describe, expect, it, vi } from 'vitest'

import { createPerformanceApi, parsePerformanceReviews } from './performance'

const reviewId = '11111111-1111-4111-8111-111111111111'
const cycleId = '22222222-2222-4222-8222-222222222222'
const employeeId = '33333333-3333-4333-8333-333333333333'
const reviewerId = '44444444-4444-4444-8444-444444444444'

describe('Performance API', () => {
  it('maps the canonical review and goals', () => {
    const [review] = parsePerformanceReviews([{ id: reviewId, cycle_id: cycleId, cycle_name: 'Mid-year', employee_id: employeeId, employee_number: 'E-1', employee_name: 'Amina', reviewer_profile_id: reviewerId, reviewer_name: 'Julie', status: 'manager_submitted', overall_score: 4, manager_comments: 'Strong', recommend_increment: true, recommend_promotion: false, hr_reason: null, acknowledged_at: null, acknowledgment_comment: null, goals: [{ id: reviewId, description: 'Deliver', manager_rating: 4 }] }])
    expect(review).toMatchObject({ employeeName: 'Amina', reviewerName: 'Julie', overallScore: 4, status: 'manager_submitted' })
    expect(review.goals[0]).toMatchObject({ description: 'Deliver', managerRating: 4 })
  })

  it('saves the proven goal and recommendation fields through one guarded RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const api = createPerformanceApi({ rpc })
    await api.saveReview({ reviewId, managerComments: ' Strong ', recommendIncrement: true, recommendPromotion: false, goals: [{ description: ' Deliver ', managerRating: 4 }] })
    expect(rpc).toHaveBeenCalledWith('rpc_save_performance_review', { p_review_id: reviewId, p_manager_comments: 'Strong', p_recommend_increment: true, p_recommend_promotion: false, p_goals: [{ description: 'Deliver', managerRating: 4 }] })
  })

  it('imports a validated legacy workbook row through the guarded HR RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: reviewId, error: null }); const api = createPerformanceApi({ rpc })
    await api.importReview({ employeeId, cycleId, reviewerProfileId: reviewerId, managerComments: 'Imported assessment', recommendIncrement: false, recommendPromotion: true, goals: [{ description: 'Safety compliance', managerRating: 5 }] })
    expect(rpc).toHaveBeenCalledWith('rpc_import_performance_review', expect.objectContaining({ p_employee_id: employeeId, p_cycle_id: cycleId, p_reviewer_profile_id: reviewerId, p_goals: [{ description: 'Safety compliance', managerRating: 5 }] }))
  })

  it('hides unexpected database diagnostics', async () => {
    const api = createPerformanceApi({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'private SQL detail' } }) })
    await expect(api.listCycles()).rejects.toThrow('Performance request could not be completed.')
  })
})
