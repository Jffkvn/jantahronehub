import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a valid date.')
const reason = z.string().trim().min(3, 'Reason must contain at least 3 characters.').max(1000, 'Reason cannot exceed 1,000 characters.')

export const leaveRequestInputSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: isoDate,
  endDate: isoDate,
  reason,
}).superRefine((value, context) => {
  if (value.endDate < value.startDate) context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before start date.' })
  if (value.startDate.slice(0, 4) !== value.endDate.slice(0, 4)) context.addIssue({ code: 'custom', path: ['endDate'], message: 'Leave must fall within one calendar year.' })
})

export const hrLeaveRequestInputSchema = leaveRequestInputSchema.extend({ employeeId: z.string().uuid() })
export const leaveDecisionInputSchema = z.object({ requestId: z.string().uuid(), decision: z.enum(['approved', 'rejected']), reason })
export const leaveReasonActionSchema = z.object({ requestId: z.string().uuid(), reason })
export const leaveBalanceAdjustmentSchema = z.object({ employeeId: z.string().uuid(), leaveTypeId: z.string().uuid(), leaveYear: z.number().int().min(2000).max(2200), adjustmentDays: z.number().finite().refine((value) => value !== 0, 'Adjustment cannot be zero.'), reason })

export type LeaveRequestInput = z.input<typeof leaveRequestInputSchema>
export type HrLeaveRequestInput = z.input<typeof hrLeaveRequestInputSchema>
export type LeaveDecisionInput = z.input<typeof leaveDecisionInputSchema>
export type LeaveReasonAction = z.input<typeof leaveReasonActionSchema>
export type LeaveBalanceAdjustment = z.input<typeof leaveBalanceAdjustmentSchema>
