import { z } from 'zod'

import { getSupabaseClient } from '../../../lib/supabase/client'
import {
  departmentInputSchema,
  jobTitleInputSchema,
  payGradeInputSchema,
  setSetupArchivedInputSchema,
  type DepartmentInput,
  type JobTitleInput,
  type PayGradeInput,
  type SetSetupArchivedInput,
} from '../schemas/setup'

const uuidSchema = z.string().uuid()
const archivedAtSchema = z.string().min(1).nullable()
const dependencyCountSchema = z.number().int().nonnegative()

const departmentRowSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  archived_at: archivedAtSchema,
  current_employee_count: dependencyCountSchema,
  active_job_title_count: dependencyCountSchema,
})

const jobTitleRowSchema = z.object({
  id: uuidSchema,
  department_id: uuidSchema.nullable(),
  department_name: z.string().min(1).nullable(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  archived_at: archivedAtSchema,
  current_employee_count: dependencyCountSchema,
})

const payGradeRowSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  minimum_gross: z.number().nonnegative().nullable(),
  maximum_gross: z.number().nonnegative().nullable(),
  description: z.string(),
  archived_at: archivedAtSchema,
  current_employee_count: dependencyCountSchema,
})

const setupRecordsSchema = z.object({
  departments: z.array(departmentRowSchema),
  job_titles: z.array(jobTitleRowSchema),
  pay_grades: z.array(payGradeRowSchema),
})

export interface DepartmentSetupRecord {
  id: string
  code: string
  name: string
  description: string
  archivedAt: string | null
  currentEmployeeCount: number
  activeJobTitleCount: number
}

export interface JobTitleSetupRecord {
  id: string
  departmentId: string | null
  departmentName: string | null
  code: string
  name: string
  description: string
  archivedAt: string | null
  currentEmployeeCount: number
}

export interface PayGradeSetupRecord {
  id: string
  code: string
  name: string
  currencyCode: string
  minimumGross: number | null
  maximumGross: number | null
  description: string
  archivedAt: string | null
  currentEmployeeCount: number
}

export interface HrSetupRecords {
  departments: DepartmentSetupRecord[]
  jobTitles: JobTitleSetupRecord[]
  payGrades: PayGradeSetupRecord[]
}

export function parseHrSetupRecords(value: unknown): HrSetupRecords {
  const records = setupRecordsSchema.parse(value)

  return {
    departments: records.departments.map((department) => ({
      id: department.id,
      code: department.code,
      name: department.name,
      description: department.description,
      archivedAt: department.archived_at,
      currentEmployeeCount: department.current_employee_count,
      activeJobTitleCount: department.active_job_title_count,
    })),
    jobTitles: records.job_titles.map((title) => ({
      id: title.id,
      departmentId: title.department_id,
      departmentName: title.department_name,
      code: title.code,
      name: title.name,
      description: title.description,
      archivedAt: title.archived_at,
      currentEmployeeCount: title.current_employee_count,
    })),
    payGrades: records.pay_grades.map((grade) => ({
      id: grade.id,
      code: grade.code,
      name: grade.name,
      currencyCode: grade.currency_code,
      minimumGross: grade.minimum_gross,
      maximumGross: grade.maximum_gross,
      description: grade.description,
      archivedAt: grade.archived_at,
      currentEmployeeCount: grade.current_employee_count,
    })),
  }
}

interface RpcResult {
  data: unknown
  error: unknown
}

export interface HrSetupRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): PromiseLike<RpcResult>
}

const exposedDatabaseMessages = new Set([
  'employees.manage_setup permission is required',
  'an active profile is required',
  'change reason must contain between 3 and 500 characters',
  'department code or name already exists',
  'job title code or name already exists',
  'pay grade code or name already exists',
  'active department not found',
  'department not found',
  'job title not found',
  'pay grade not found',
  'minimum gross cannot be negative',
  'maximum gross cannot be negative',
  'maximum gross cannot be less than minimum gross',
  'department has active job titles or current employee assignments',
  'job title is assigned to a current employee',
  'pay grade is assigned to a current employee',
  'restore the department before restoring its job title',
  'invalid HR setup record type',
])

function safeRequestError(error: unknown): Error {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    exposedDatabaseMessages.has(error.message)
  ) {
    return new Error(error.message)
  }

  return new Error('HR setup request could not be completed.')
}

export interface HrSetupApi {
  list(): Promise<HrSetupRecords>
  saveDepartment(input: DepartmentInput): Promise<void>
  saveJobTitle(input: JobTitleInput): Promise<void>
  savePayGrade(input: PayGradeInput): Promise<void>
  setArchived(input: SetSetupArchivedInput): Promise<void>
}

export function createHrSetupApi(
  client: HrSetupRpcClient =
    getSupabaseClient() as unknown as HrSetupRpcClient,
): HrSetupApi {
  async function rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): Promise<unknown> {
    const { data, error } = await client.rpc(functionName, parameters)
    if (error) throw safeRequestError(error)
    return data
  }

  return {
    async list() {
      return parseHrSetupRecords(await rpc('hr_list_setup_records'))
    },
    async saveDepartment(input) {
      const parsed = departmentInputSchema.parse(input)
      await rpc('hr_save_department', {
        target_id: parsed.id,
        setup_code: parsed.code,
        setup_name: parsed.name,
        setup_description: parsed.description,
        change_reason: parsed.reason,
      })
    },
    async saveJobTitle(input) {
      const parsed = jobTitleInputSchema.parse(input)
      await rpc('hr_save_job_title', {
        target_id: parsed.id,
        target_department_id: parsed.departmentId,
        setup_code: parsed.code,
        setup_name: parsed.name,
        setup_description: parsed.description,
        change_reason: parsed.reason,
      })
    },
    async savePayGrade(input) {
      const parsed = payGradeInputSchema.parse(input)
      await rpc('hr_save_pay_grade', {
        target_id: parsed.id,
        setup_code: parsed.code,
        setup_name: parsed.name,
        setup_currency_code: parsed.currencyCode,
        minimum_gross: parsed.minimumGross,
        maximum_gross: parsed.maximumGross,
        setup_description: parsed.description,
        change_reason: parsed.reason,
      })
    },
    async setArchived(input) {
      const parsed = setSetupArchivedInputSchema.parse(input)
      await rpc('hr_set_setup_archived', {
        setup_kind: parsed.kind,
        target_id: parsed.id,
        archived: parsed.archived,
        change_reason: parsed.reason,
      })
    },
  }
}

function defaultApi() {
  return createHrSetupApi()
}

export const hrSetupApi: HrSetupApi = {
  list: () => defaultApi().list(),
  saveDepartment: (input) => defaultApi().saveDepartment(input),
  saveJobTitle: (input) => defaultApi().saveJobTitle(input),
  savePayGrade: (input) => defaultApi().savePayGrade(input),
  setArchived: (input) => defaultApi().setArchived(input),
}
