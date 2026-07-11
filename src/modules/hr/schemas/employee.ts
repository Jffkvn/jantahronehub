import { z } from 'zod'

const optionalEmail = z.union([z.literal(''), z.string().email('Enter a valid email address.')])

export const employeeFormSchema = z.object({
  employeeNumber: z.string().trim().min(1, 'Employee number is required.').max(40),
  legalName: z.string().trim().min(2, 'Legal name is required.').max(160),
  preferredName: z.string().trim().max(100),
  companyEmail: optionalEmail,
  workPhone: z.string().trim().max(32),
  startDate: z.iso.date('Enter a valid start date.'),
  employmentType: z.enum(['full_time', 'part_time', 'casual', 'intern', 'contractor']),
  contractType: z.enum(['permanent', 'fixed_term', 'casual', 'internship', 'consultancy']),
})

export const offboardingSchema = z.object({
  endDate: z.iso.date('Enter a valid last working day.'),
  exitReason: z.string().trim().min(2, 'Exit reason is required.').max(120),
  exitNotes: z.string().trim().max(2000),
  finalPayStatus: z.enum(['not_applicable', 'pending', 'prepared', 'paid']),
})

export const archiveEmployeeSchema = z.object({
  reason: z.string().trim().min(3, 'Reason must contain at least 3 characters.').max(500),
})

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>
export type OffboardingValues = z.infer<typeof offboardingSchema>
