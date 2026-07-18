import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.')
const money = z.coerce.number().finite().positive('Amount must be greater than zero.')
const reason = z.string().trim().min(3, 'Reason must contain at least 3 characters.').max(1000, 'Reason cannot exceed 1,000 characters.')
const instalments = z.coerce.number().int().min(1, 'Use at least one instalment.').max(60, 'Use no more than 60 instalments.')
const firstOfMonth = isoDate.refine((value) => value.endsWith('-01'), 'Deduction start must be the first day of a month.')

export const staffAdvanceRequestSchema = z.object({ amount: money, reason, instalments, deductionStartMonth: firstOfMonth })
export const hrStaffAdvanceInputSchema = staffAdvanceRequestSchema.extend({ employeeId: z.string().uuid(), dateIssued: isoDate, notes: z.string().trim().max(2000).default('') })
export const staffAdvanceDecisionSchema = z.object({ advanceId: z.string().uuid(), decision: z.enum(['approved', 'rejected']), reason })
export const staffAdvanceRepaymentSchema = z.object({ advanceId: z.string().uuid(), payrollPeriod: firstOfMonth, amount: money, source: z.enum(['payroll', 'manual', 'exit']), notes: z.string().trim().max(2000).default('') })
export const staffAdvanceTransitionSchema = z.object({ advanceId: z.string().uuid(), transition: z.enum(['flagged', 'reopened', 'settled', 'written_off', 'voided']), reason })

export type StaffAdvanceRequestInput = z.input<typeof staffAdvanceRequestSchema>
export type HrStaffAdvanceInput = z.input<typeof hrStaffAdvanceInputSchema>
export type StaffAdvanceDecisionInput = z.input<typeof staffAdvanceDecisionSchema>
export type StaffAdvanceRepaymentInput = z.input<typeof staffAdvanceRepaymentSchema>
export type StaffAdvanceTransitionInput = z.input<typeof staffAdvanceTransitionSchema>
