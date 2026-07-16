import { describe, expect, it, vi } from 'vitest'

import {
  createHrSetupApi,
  parseHrSetupRecords,
} from './setup'
import {
  departmentInputSchema,
  jobTitleInputSchema,
  payGradeInputSchema,
} from '../schemas/setup'

const departmentId = '11111111-1111-4111-8111-111111111111'
const jobTitleId = '22222222-2222-4222-8222-222222222222'
const payGradeId = '33333333-3333-4333-8333-333333333333'

describe('HR setup response parsing', () => {
  it('maps canonical setup records and dependency counts', () => {
    expect(
      parseHrSetupRecords({
        departments: [
          {
            id: departmentId,
            code: 'OPS',
            name: 'Operations',
            description: 'Field operations',
            archived_at: null,
            current_employee_count: 2,
            active_job_title_count: 1,
          },
        ],
        job_titles: [
          {
            id: jobTitleId,
            department_id: departmentId,
            department_name: 'Operations',
            code: 'TECH',
            name: 'Technician',
            description: '',
            archived_at: null,
            current_employee_count: 2,
          },
        ],
        pay_grades: [
          {
            id: payGradeId,
            code: 'G1',
            name: 'Grade One',
            currency_code: 'UGX',
            minimum_gross: 1000000,
            maximum_gross: 2000000,
            description: '',
            archived_at: null,
            current_employee_count: 2,
          },
        ],
      }),
    ).toEqual({
      departments: [
        {
          id: departmentId,
          code: 'OPS',
          name: 'Operations',
          description: 'Field operations',
          archivedAt: null,
          currentEmployeeCount: 2,
          activeJobTitleCount: 1,
        },
      ],
      jobTitles: [
        {
          id: jobTitleId,
          departmentId,
          departmentName: 'Operations',
          code: 'TECH',
          name: 'Technician',
          description: '',
          archivedAt: null,
          currentEmployeeCount: 2,
        },
      ],
      payGrades: [
        {
          id: payGradeId,
          code: 'G1',
          name: 'Grade One',
          currencyCode: 'UGX',
          minimumGross: 1000000,
          maximumGross: 2000000,
          description: '',
          archivedAt: null,
          currentEmployeeCount: 2,
        },
      ],
    })
  })

  it('rejects malformed setup data instead of trusting an RPC payload', () => {
    expect(() =>
      parseHrSetupRecords({
        departments: [{ id: 'not-a-uuid', code: '', name: '' }],
        job_titles: [],
        pay_grades: [],
      }),
    ).toThrow()
  })
})

describe('HR setup input validation', () => {
  it('normalizes department codes, names, descriptions and reasons', () => {
    expect(
      departmentInputSchema.parse({
        id: null,
        code: '  ops_1  ',
        name: '  Operations  ',
        description: '  Field operations  ',
        reason: '  Establish the operations department  ',
      }),
    ).toEqual({
      id: null,
      code: 'OPS_1',
      name: 'Operations',
      description: 'Field operations',
      reason: 'Establish the operations department',
    })
  })

  it('rejects a pay grade whose maximum is below its minimum', () => {
    const result = payGradeInputSchema.safeParse({
      id: null,
      code: 'G1',
      name: 'Grade One',
      currencyCode: 'UGX',
      minimumGross: '2000000',
      maximumGross: '1000000',
      description: '',
      reason: 'Create the first pay grade',
    })

    expect(result.success).toBe(false)
  })

  it('allows a company-wide job title without a department', () => {
    expect(
      jobTitleInputSchema.parse({
        id: null,
        departmentId: null,
        code: 'tech',
        name: 'Technician',
        description: '',
        reason: 'Create a company-wide title',
      }),
    ).toMatchObject({ departmentId: null, code: 'TECH' })
  })
})

describe('HR setup RPC adapter', () => {
  it('sends normalized department values using database parameter names', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: departmentId,
        code: 'OPS',
        name: 'Operations',
        description: '',
        archived_at: null,
      },
      error: null,
    })
    const api = createHrSetupApi({ rpc })

    await api.saveDepartment({
      id: null,
      code: ' ops ',
      name: ' Operations ',
      description: ' ',
      reason: ' Create department ',
    })

    expect(rpc).toHaveBeenCalledWith('hr_save_department', {
      target_id: null,
      setup_code: 'OPS',
      setup_name: 'Operations',
      setup_description: '',
      change_reason: 'Create department',
    })
  })

  it('returns safe allow-listed dependency errors', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'job title is assigned to a current employee' },
    })
    const api = createHrSetupApi({ rpc })

    await expect(
      api.setArchived({
        kind: 'job_title',
        id: jobTitleId,
        archived: true,
        reason: 'Retire the obsolete title',
      }),
    ).rejects.toThrow('job title is assigned to a current employee')
  })

  it('hides unexpected database diagnostics', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'internal SQL contained private employee data',
        details: 'sensitive diagnostic payload',
      },
    })
    const api = createHrSetupApi({ rpc })

    await expect(api.list()).rejects.toThrow(
      'HR setup request could not be completed.',
    )
  })
})
