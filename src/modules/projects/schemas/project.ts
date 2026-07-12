import { z } from 'zod'

export const projectSchema = z.object({
  name: z.string()
    .min(1, 'Project name is required')
    .max(250, 'Project name must be under 250 characters')
    .transform(val => val.trim()),
  site_location: z.string()
    .min(1, 'Site location is required')
    .transform(val => val.trim()),
  status: z.enum(['active', 'completed', 'on_hold']),
  estimated_budget_ugx: z.number().nonnegative().nullable().optional()
    .or(z.string().transform((val) => {
      if (!val || val.trim() === '') return null
      const num = Number(val.replace(/,/g, ''))
      return isNaN(num) ? null : num
    }).nullable().optional()),
  budget_notes: z.string().transform(val => val.trim()).nullable().optional(),
  health_status: z.enum(['on_track', 'needs_attention', 'at_risk']).default('on_track')
})

export const dailyUpdateSchema = z.object({
  project_id: z.string().uuid('Invalid project reference'),
  update_date: z.string().min(1, 'Update date is required'),
  summary: z.string().min(1, 'Progress summary is required').transform(val => val.trim()),
  photo_urls: z.array(z.string().url('Invalid photo URL')).default([]),
  status: z.enum(['draft', 'submitted']).default('submitted'),
  pm_feedback: z.string().optional().nullable()
})

export type ProjectFormData = z.infer<typeof projectSchema>
export type DailyUpdateFormData = z.infer<typeof dailyUpdateSchema>
