import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const trimmed = (minimum: number, maximum: number) => z.string().trim().min(minimum).max(maximum)

export const performanceCycleInputSchema = z.object({
  name: trimmed(2, 160),
  startDate: date,
  endDate: date,
}).refine((value) => value.endDate >= value.startDate, { message: 'End date must be on or after the start date.', path: ['endDate'] })

export const performanceReviewDraftSchema = z.object({
  reviewId: z.string().uuid(),
  managerComments: trimmed(3, 4000),
  recommendIncrement: z.boolean(),
  recommendPromotion: z.boolean(),
  goals: z.array(z.object({ description: trimmed(2, 1000), managerRating: z.coerce.number().min(1).max(5) })).min(1).max(30),
})

export const performanceReviewStartSchema = z.object({ employeeId: z.string().uuid(), cycleId: z.string().uuid(), reviewerProfileId: z.string().uuid() })
export const performanceDecisionSchema = z.object({ reviewId: z.string().uuid(), decision: z.enum(['approved', 'reopened']), reason: trimmed(3, 2000) })
export const performanceAcknowledgmentSchema = z.object({ reviewId: z.string().uuid(), comment: z.string().trim().max(2000) })
export const performanceImportSchema = z.object({
  employeeId: z.string().uuid(), cycleId: z.string().uuid(), reviewerProfileId: z.string().uuid(),
  managerComments: trimmed(3, 4000), recommendIncrement: z.boolean(), recommendPromotion: z.boolean(),
  goals: z.array(z.object({ description: trimmed(2, 1000), managerRating: z.coerce.number().min(1).max(5) })).min(1).max(3),
})

export type PerformanceCycleInput = z.infer<typeof performanceCycleInputSchema>
export type PerformanceReviewDraft = z.infer<typeof performanceReviewDraftSchema>
export type PerformanceReviewStart = z.infer<typeof performanceReviewStartSchema>
export type PerformanceDecision = z.infer<typeof performanceDecisionSchema>
export type PerformanceAcknowledgment = z.infer<typeof performanceAcknowledgmentSchema>
export type PerformanceImport = z.infer<typeof performanceImportSchema>
