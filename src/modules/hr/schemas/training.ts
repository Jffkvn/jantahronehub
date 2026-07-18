import { z } from 'zod'

export const trainingStatusSchema = z.enum(['scheduled', 'attended', 'passed', 'failed'])
export const trainingRecordInputSchema = z.object({
  employeeIds: z.array(z.string().uuid()).min(1), topic: z.string().trim().min(2).max(200), provider: z.string().trim().max(200).optional().default(''), completionDate: z.string().date(), durationHours: z.coerce.number().min(0).max(10000).nullable().optional(), cost: z.coerce.number().min(0).max(1_000_000_000).nullable().optional(), status: trainingStatusSchema, expiryDate: z.string().date().nullable().optional(), certificateReference: z.string().trim().max(160).optional().default(''),
}).superRefine((value, context) => { if (value.expiryDate && value.expiryDate < value.completionDate) context.addIssue({ code: 'custom', path: ['expiryDate'], message: 'Expiry date cannot be before completion date.' }) })
export type TrainingRecordInput = z.infer<typeof trainingRecordInputSchema>
