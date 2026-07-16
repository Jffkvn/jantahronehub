import { z } from 'zod'

const optionalEmail = z.union([z.literal(''), z.string().email('Enter a valid email address.')])
const optionalDate = z.union([z.literal(''), z.iso.date('Enter a valid date.')])
const money = z.union([z.literal(''), z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount.')])

export const employeeFormSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(160),
  nationalId: z.string().trim().max(80), companyEmail: optionalEmail, personalEmail: optionalEmail,
  phone: z.string().trim().max(32), gender: z.enum(['', 'female', 'male', 'other', 'prefer_not_to_say']), dateOfBirth: optionalDate,
  departmentId: z.string(), jobTitleId: z.string(), payGradeId: z.string(), employmentType: z.enum(['full_time', 'part_time', 'casual', 'intern', 'contractor']), startDate: z.iso.date('Enter a valid start date.'),
  contractType: z.enum(['permanent', 'fixed_term', 'casual', 'internship', 'consultancy']), contractEndDate: optionalDate,
  probationEndDate: optionalDate, probationStatus: z.enum(['not_applicable', 'on_probation', 'passed', 'extended', 'failed']),
  grossSalary: money, currency: z.enum(['UGX']), customOvertimeRate: money, paymentMethod: z.enum(['bank', 'mobile_money', 'cash']), mobileMoneyNumber: z.string().trim().max(32),
  bankName: z.string().trim().max(120), accountNumber: z.string().trim().max(80), sortCode: z.string().trim().max(40),
  employeeNumber: z.string().trim().min(1, 'Employee number is required.').max(40), tinNumber: z.string().trim().max(40), nssfNumber: z.string().trim().max(40),
  employeeTaxType: z.enum(['local', 'global', 'contractor', 'exempt']), pctMonthWorked: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a percentage.').refine((value) => Number(value) >= 0 && Number(value) <= 100, 'Percentage must be between 0 and 100.'),
  whtRate: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter a percentage.').refine((value) => Number(value) >= 0 && Number(value) <= 100, 'Percentage must be between 0 and 100.'),
}).superRefine((values, context) => {
  if (values.contractType === 'fixed_term' && !values.contractEndDate) context.addIssue({ code: 'custom', path: ['contractEndDate'], message: 'Contract end date is required for fixed-term contracts.' })
  if (values.paymentMethod === 'bank' && !values.bankName) context.addIssue({ code: 'custom', path: ['bankName'], message: 'Bank name is required for bank payment.' })
  if (values.paymentMethod === 'bank' && !values.accountNumber) context.addIssue({ code: 'custom', path: ['accountNumber'], message: 'Account number is required for bank payment.' })
  if (values.paymentMethod === 'mobile_money' && !values.mobileMoneyNumber) context.addIssue({ code: 'custom', path: ['mobileMoneyNumber'], message: 'Mobile money number is required for mobile-money payment.' })
})

export const offboardingSchema = z.object({ endDate: z.iso.date('Enter a valid last working day.'), exitReason: z.string().trim().min(2, 'Exit reason is required.').max(120), exitNotes: z.string().trim().max(2000), finalPayStatus: z.enum(['not_applicable', 'pending', 'prepared', 'paid']) })
export const archiveEmployeeSchema = z.object({ reason: z.string().trim().min(3, 'Reason must contain at least 3 characters.').max(500) })

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>
export type OffboardingValues = z.infer<typeof offboardingSchema>
