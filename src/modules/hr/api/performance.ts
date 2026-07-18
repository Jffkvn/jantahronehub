import { z } from 'zod'

import { getSupabaseClient } from '../../../lib/supabase/client'
import { performanceAcknowledgmentSchema, performanceCycleInputSchema, performanceDecisionSchema, performanceImportSchema, performanceReviewDraftSchema, performanceReviewStartSchema, type PerformanceAcknowledgment, type PerformanceCycleInput, type PerformanceDecision, type PerformanceImport, type PerformanceReviewDraft, type PerformanceReviewStart } from '../schemas/performance'

const uuid = z.string().uuid(); const numeric = z.coerce.number()
const cycleRow = z.object({ id: uuid, name: z.string(), start_date: z.string(), end_date: z.string(), status: z.enum(['draft', 'active', 'closed']), total_reviews: numeric.int().default(0), completed_reviews: numeric.int().default(0) })
const goalRow = z.object({ id: uuid, description: z.string(), manager_rating: numeric })
const reviewRow = z.object({ id: uuid, cycle_id: uuid, cycle_name: z.string(), employee_id: uuid, employee_number: z.string(), employee_name: z.string(), reviewer_profile_id: uuid, reviewer_name: z.string(), status: z.enum(['draft', 'manager_submitted', 'hr_approved', 'employee_acknowledged', 'reopened']), overall_score: numeric.nullable(), manager_comments: z.string().nullable(), recommend_increment: z.boolean(), recommend_promotion: z.boolean(), hr_reason: z.string().nullable(), acknowledged_at: z.string().nullable(), acknowledgment_comment: z.string().nullable(), goals: z.array(goalRow).default([]) })
const reviewerRow = z.object({ profile_id: uuid, display_name: z.string(), role_label: z.string() })

export interface PerformanceCycle { id: string; name: string; startDate: string; endDate: string; status: 'draft'|'active'|'closed'; totalReviews: number; completedReviews: number }
export interface PerformanceGoal { id: string; description: string; managerRating: number }
export interface PerformanceReview { id: string; cycleId: string; cycleName: string; employeeId: string; employeeNumber: string; employeeName: string; reviewerProfileId: string; reviewerName: string; status: 'draft'|'manager_submitted'|'hr_approved'|'employee_acknowledged'|'reopened'; overallScore: number|null; managerComments: string|null; recommendIncrement: boolean; recommendPromotion: boolean; hrReason: string|null; acknowledgedAt: string|null; acknowledgmentComment: string|null; goals: PerformanceGoal[] }
export interface PerformanceReviewer { profileId: string; displayName: string; roleLabel: string }

export const parsePerformanceCycles = (value: unknown): PerformanceCycle[] => z.array(cycleRow).parse(value).map((row) => ({ id: row.id, name: row.name, startDate: row.start_date, endDate: row.end_date, status: row.status, totalReviews: row.total_reviews, completedReviews: row.completed_reviews }))
export const parsePerformanceReviews = (value: unknown): PerformanceReview[] => z.array(reviewRow).parse(value).map((row) => ({ id: row.id, cycleId: row.cycle_id, cycleName: row.cycle_name, employeeId: row.employee_id, employeeNumber: row.employee_number, employeeName: row.employee_name, reviewerProfileId: row.reviewer_profile_id, reviewerName: row.reviewer_name, status: row.status, overallScore: row.overall_score, managerComments: row.manager_comments, recommendIncrement: row.recommend_increment, recommendPromotion: row.recommend_promotion, hrReason: row.hr_reason, acknowledgedAt: row.acknowledged_at, acknowledgmentComment: row.acknowledgment_comment, goals: row.goals.map((goal) => ({ id: goal.id, description: goal.description, managerRating: goal.manager_rating })) }))

interface RpcResult { data: unknown; error: unknown }
export interface PerformanceRpcClient { rpc(name: string, parameters?: Record<string, unknown>): PromiseLike<RpcResult> }
const exposed = new Set(['Only an assigned reviewer can edit this review.', 'Only submitted reviews can be approved.', 'Only released reviews can be acknowledged.', 'This employee already has a review in the cycle.'])
function safeError(error: unknown) { const message = typeof error === 'object' && error && 'message' in error && typeof error.message === 'string' ? error.message : ''; return new Error(exposed.has(message) ? message : 'Performance request could not be completed.') }

export interface PerformanceApi {
  listCycles(): Promise<PerformanceCycle[]>; createCycle(input: PerformanceCycleInput): Promise<string>; setCycleStatus(cycleId: string, status: PerformanceCycle['status']): Promise<void>;
  listReviews(cycleId?: string): Promise<PerformanceReview[]>; listAssignedReviews(): Promise<PerformanceReview[]>; listMyReviews(): Promise<PerformanceReview[]>; listReviewers(): Promise<PerformanceReviewer[]>;
  startReview(input: PerformanceReviewStart): Promise<string>; saveReview(input: PerformanceReviewDraft): Promise<void>; submitReview(reviewId: string): Promise<void>; decide(input: PerformanceDecision): Promise<void>; acknowledge(input: PerformanceAcknowledgment): Promise<void>;
  importReview(input: PerformanceImport): Promise<string>;
}

export function createPerformanceApi(client: PerformanceRpcClient = getSupabaseClient() as unknown as PerformanceRpcClient): PerformanceApi {
  async function rpc(name: string, parameters?: Record<string, unknown>) { const { data, error } = await client.rpc(name, parameters); if (error) throw safeError(error); return data }
  return {
    async listCycles() { return parsePerformanceCycles(await rpc('rpc_list_performance_cycles')) },
    async createCycle(input) { const value = performanceCycleInputSchema.parse(input); return uuid.parse(await rpc('rpc_create_performance_cycle', { p_name: value.name, p_start_date: value.startDate, p_end_date: value.endDate })) },
    async setCycleStatus(cycleId, status) { await rpc('rpc_set_performance_cycle_status', { p_cycle_id: uuid.parse(cycleId), p_status: status }) },
    async listReviews(cycleId) { return parsePerformanceReviews(await rpc('rpc_list_performance_reviews', { p_cycle_id: cycleId ? uuid.parse(cycleId) : null })) },
    async listAssignedReviews() { return parsePerformanceReviews(await rpc('rpc_list_my_assigned_performance_reviews')) },
    async listMyReviews() { return parsePerformanceReviews(await rpc('rpc_list_my_performance_reviews')) },
    async listReviewers() { return z.array(reviewerRow).parse(await rpc('rpc_list_performance_reviewers')).map((row) => ({ profileId: row.profile_id, displayName: row.display_name, roleLabel: row.role_label })) },
    async startReview(input) { const value = performanceReviewStartSchema.parse(input); return uuid.parse(await rpc('rpc_start_performance_review', { p_employee_id: value.employeeId, p_cycle_id: value.cycleId, p_reviewer_profile_id: value.reviewerProfileId })) },
    async saveReview(input) { const value = performanceReviewDraftSchema.parse(input); await rpc('rpc_save_performance_review', { p_review_id: value.reviewId, p_manager_comments: value.managerComments, p_recommend_increment: value.recommendIncrement, p_recommend_promotion: value.recommendPromotion, p_goals: value.goals }) },
    async submitReview(reviewId) { await rpc('rpc_submit_performance_review', { p_review_id: uuid.parse(reviewId) }) },
    async decide(input) { const value = performanceDecisionSchema.parse(input); await rpc('rpc_decide_performance_review', { p_review_id: value.reviewId, p_decision: value.decision, p_reason: value.reason }) },
    async acknowledge(input) { const value = performanceAcknowledgmentSchema.parse(input); await rpc('rpc_acknowledge_performance_review', { p_review_id: value.reviewId, p_comment: value.comment }) },
    async importReview(input) { const value = performanceImportSchema.parse(input); return uuid.parse(await rpc('rpc_import_performance_review', { p_employee_id: value.employeeId, p_cycle_id: value.cycleId, p_reviewer_profile_id: value.reviewerProfileId, p_manager_comments: value.managerComments, p_recommend_increment: value.recommendIncrement, p_recommend_promotion: value.recommendPromotion, p_goals: value.goals })) },
  }
}

export const performanceApi = createPerformanceApi()
