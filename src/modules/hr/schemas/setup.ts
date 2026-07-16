import { z } from 'zod'

const uuidSchema = z.string().uuid()

const setupCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .pipe(
    z
      .string()
      .min(1, 'Code is required.')
      .max(20, 'Code cannot exceed 20 characters.')
      .regex(
        /^[A-Z0-9][A-Z0-9_-]*$/,
        'Use letters, numbers, underscores or hyphens.',
      ),
  )

const setupNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required.')
  .max(120, 'Name cannot exceed 120 characters.')

const descriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Description cannot exceed 1,000 characters.')

const reasonSchema = z
  .string()
  .trim()
  .min(3, 'Reason must contain at least 3 characters.')
  .max(500, 'Reason cannot exceed 500 characters.')

const optionalMoneySchema = z
  .union([
    z.literal(''),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount.'),
    z.number().nonnegative(),
    z.null(),
  ])
  .transform((value) => {
    if (value === '' || value === null) return null
    return typeof value === 'number' ? value : Number(value)
  })

export const departmentInputSchema = z.object({
  id: uuidSchema.nullable(),
  code: setupCodeSchema,
  name: setupNameSchema,
  description: descriptionSchema,
  reason: reasonSchema,
})

export const jobTitleInputSchema = z.object({
  id: uuidSchema.nullable(),
  departmentId: uuidSchema.nullable(),
  code: setupCodeSchema,
  name: setupNameSchema,
  description: descriptionSchema,
  reason: reasonSchema,
})

export const payGradeInputSchema = z
  .object({
    id: uuidSchema.nullable(),
    code: setupCodeSchema,
    name: setupNameSchema,
    currencyCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[A-Z]{3}$/, 'Enter a three-letter currency code.')),
    minimumGross: optionalMoneySchema,
    maximumGross: optionalMoneySchema,
    description: descriptionSchema,
    reason: reasonSchema,
  })
  .superRefine((value, context) => {
    if (
      value.minimumGross !== null &&
      value.maximumGross !== null &&
      value.maximumGross < value.minimumGross
    ) {
      context.addIssue({
        code: 'custom',
        path: ['maximumGross'],
        message: 'Maximum gross cannot be less than minimum gross.',
      })
    }
  })

export const setSetupArchivedInputSchema = z.object({
  kind: z.enum(['department', 'job_title', 'pay_grade']),
  id: uuidSchema,
  archived: z.boolean(),
  reason: reasonSchema,
})

export type DepartmentInput = z.input<typeof departmentInputSchema>
export type JobTitleInput = z.input<typeof jobTitleInputSchema>
export type PayGradeInput = z.input<typeof payGradeInputSchema>
export type SetSetupArchivedInput = z.input<
  typeof setSetupArchivedInputSchema
>
