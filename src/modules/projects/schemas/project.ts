import { z } from 'zod'

const nullableTrimmedText = z.string().trim().nullable()
const optionalNullableTrimmedText = z.string().trim().nullable().optional()
const nullableDate = z.iso.date().nullable()

export const projectStatusSchema = z.enum([
  'planned',
  'active',
  'on_hold',
  'completed',
  'cancelled',
  'archived',
])
export const projectHealthSchema = z.enum([
  'on_track',
  'needs_attention',
  'at_risk',
])

export const projectSchema = z.object({
  id: z.uuid(),
  project_code: z.string().regex(
    /^[A-Za-z0-9][A-Za-z0-9._/-]{1,49}$/,
    'Use 2–50 letters, numbers, dots, slashes, underscores or hyphens',
  ),
  name: z.string().trim().min(1).max(250),
  client_name: nullableTrimmedText,
  site_location: nullableTrimmedText,
  planned_start_date: nullableDate,
  expected_end_date: nullableDate,
  actual_completion_date: nullableDate,
  contract_reference: nullableTrimmedText,
  budget_reference: nullableTrimmedText,
  operational_notes: nullableTrimmedText,
  status: projectStatusSchema,
  health_status: projectHealthSchema,
  estimated_budget_ugx: z.number().nonnegative().nullable(),
  budget_notes: nullableTrimmedText,
  budget_set_by: z.uuid().nullable(),
  created_by: z.uuid(),
  updated_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).superRefine((project, context) => {
  if (
    project.planned_start_date
    && project.expected_end_date
    && project.expected_end_date < project.planned_start_date
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expected_end_date'],
      message: 'Expected end date cannot be before the planned start date',
    })
  }
})

const createProjectValuesBaseSchema = z.object({
  projectCode: z.string().trim().toUpperCase().regex(
    /^[A-Za-z0-9][A-Za-z0-9._/-]{1,49}$/,
    'Enter a valid project code',
  ),
  name: z.string().trim().min(1).max(250),
  clientName: optionalNullableTrimmedText,
  siteLocation: optionalNullableTrimmedText,
  plannedStartDate: z.iso.date().nullable().optional(),
  expectedEndDate: z.iso.date().nullable().optional(),
  contractReference: optionalNullableTrimmedText,
  budgetReference: optionalNullableTrimmedText,
  operationalNotes: optionalNullableTrimmedText,
  status: projectStatusSchema.default('planned'),
  healthStatus: projectHealthSchema.default('on_track'),
  estimatedBudgetUgx: z.number().nonnegative().nullable().optional(),
  budgetNotes: optionalNullableTrimmedText,
})

const createProjectValuesSchema = createProjectValuesBaseSchema.superRefine((project, context) => {
  if (
    project.plannedStartDate
    && project.expectedEndDate
    && project.expectedEndDate < project.plannedStartDate
  ) {
    context.addIssue({
      code: 'custom',
      path: ['expectedEndDate'],
      message: 'Expected end date cannot be before the planned start date',
    })
  }
})

export const createProjectCommandSchema = z.object({
  project: createProjectValuesSchema,
  primaryPmId: z.uuid().nullable(),
  coordinatorIds: z.array(z.uuid()).transform((ids) => [...new Set(ids)]),
  reason: z.string().trim().min(3).max(500),
})

export const updateProjectCommandSchema = z.object({
  projectId: z.uuid(),
  changes: createProjectValuesBaseSchema.partial(),
  reason: z.string().trim().min(3).max(500),
})

export const saveDailyUpdateCommandSchema = z.object({
  updateId: z.uuid().nullable(),
  projectId: z.uuid(),
  updateDate: z.iso.date(),
  summary: z.string().trim().min(1),
  photoUrls: z.array(z.url()).default([]),
  submit: z.boolean(),
})

export const dailyUpdateSchema = z.object({
  project_id: z.uuid(),
  update_date: z.iso.date(),
  summary: z.string().trim().min(1),
  photo_urls: z.array(z.url()).default([]),
  status: z.enum(['draft', 'submitted']).default('submitted'),
  pm_feedback: z.string().trim().optional().nullable(),
})

export type ProjectFormData = z.infer<typeof createProjectValuesSchema>
export type DailyUpdateFormData = z.infer<typeof dailyUpdateSchema>
