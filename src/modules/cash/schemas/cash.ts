import { z } from 'zod'

export const cashRequestSchema = z.object({
  project_id: z.string().min(1, 'Project selection is required'),
  user_id: z.string().min(1, 'Recipient user is required'),
  amount_requested: z.number().positive('Requested amount must be greater than zero'),
  purpose: z.string().min(5, 'Purpose description must be at least 5 characters long')
})

export type CashRequestInput = z.infer<typeof cashRequestSchema>

export const cashExpenseSchema = z.object({
  expense_date: z.string().min(1, 'Expense date is required'),
  category: z.string().min(1, 'Expense category is required'),
  amount: z.number().positive('Expense amount must be greater than zero'),
  vendor: z.string().min(1, 'Vendor/Payee is required'),
  explanation: z.string().min(5, 'Explanation details must be at least 5 characters long'),
  receipt_url: z.string().nullable().optional(),
  receipt_unavailable: z.boolean().default(false),
  receipt_unavailable_explanation: z.string().nullable().optional()
}).refine(data => {
  if (data.receipt_unavailable && (!data.receipt_unavailable_explanation || data.receipt_unavailable_explanation.trim() === '')) {
    return false
  }
  return true
}, {
  message: 'Explanation is required when receipt is unavailable',
  path: ['receipt_unavailable_explanation']
})

export type CashExpenseInput = z.infer<typeof cashExpenseSchema>
