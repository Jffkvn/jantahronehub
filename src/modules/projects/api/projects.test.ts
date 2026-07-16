import { describe, expect, it, vi } from 'vitest'

import {
  createProjectsApi,
  parseProjectCandidate,
  parseProjectRow,
} from './projects'
import { createProjectCommandSchema, projectSchema } from '../schemas/project'

const projectId = '11111111-1111-4111-8111-111111111111'
const pmId = '22222222-2222-4222-8222-222222222222'
const coordinatorId = '33333333-3333-4333-8333-333333333333'

const projectRow = {
  id: projectId,
  project_code: 'PRJ-001',
  name: 'Kampala Fit Out',
  client_name: 'Client A',
  site_location: 'Kampala',
  planned_start_date: '2026-08-01',
  expected_end_date: '2026-12-31',
  actual_completion_date: null,
  contract_reference: 'CT-1',
  budget_reference: 'BD-1',
  operational_notes: 'Mobilising',
  status: 'planned',
  health_status: 'on_track',
  estimated_budget_ugx: 1200000,
  budget_notes: null,
  budget_set_by: null,
  created_by: pmId,
  updated_by: pmId,
  created_at: '2026-07-16T10:00:00.000Z',
  updated_at: '2026-07-16T10:00:00.000Z',
}

describe('Projects validation and response mapping', () => {
  it('parses all expanded fields and each supported status', () => {
    for (const status of ['planned', 'active', 'on_hold', 'completed', 'cancelled', 'archived']) {
      expect(projectSchema.parse({ ...projectRow, status }).status).toBe(status)
    }
    expect(parseProjectRow(projectRow)).toMatchObject({
      id: projectId,
      projectCode: 'PRJ-001',
      clientName: 'Client A',
      plannedStartDate: '2026-08-01',
      updatedBy: pmId,
    })
  })

  it('rejects invalid codes, reversed dates and unsupported statuses locally', () => {
    expect(projectSchema.safeParse({ ...projectRow, project_code: ' bad code ' }).success).toBe(false)
    expect(projectSchema.safeParse({
      ...projectRow,
      planned_start_date: '2026-12-31',
      expected_end_date: '2026-08-01',
    }).success).toBe(false)
    expect(projectSchema.safeParse({ ...projectRow, status: 'finished' }).success).toBe(false)
  })

  it('normalizes creation text, de-duplicates coordinators and requires a reason', () => {
    expect(createProjectCommandSchema.parse({
      project: {
        projectCode: ' prj-002 ',
        name: ' New Site ',
        clientName: ' Client B ',
        status: 'planned',
        healthStatus: 'on_track',
      },
      primaryPmId: pmId,
      coordinatorIds: [coordinatorId, coordinatorId],
      reason: ' Create the approved project ',
    })).toMatchObject({
      project: { projectCode: 'PRJ-002', name: 'New Site', clientName: 'Client B' },
      coordinatorIds: [coordinatorId],
      reason: 'Create the approved project',
    })

    expect(createProjectCommandSchema.safeParse({
      project: { projectCode: 'PRJ-002', name: 'New Site' },
      primaryPmId: null,
      coordinatorIds: [],
      reason: ' ',
    }).success).toBe(false)
  })

  it('keeps candidate roles distinct and discards confidential or unknown fields', () => {
    expect(parseProjectCandidate({
      profile_id: pmId,
      display_name: 'Project Manager',
      role_keys: ['project_manager'],
      email: 'must-not-leak@example.invalid',
      salary: 9000000,
    })).toEqual({
      profileId: pmId,
      displayName: 'Project Manager',
      roleKeys: ['project_manager'],
    })
    expect(parseProjectCandidate({
      profile_id: coordinatorId,
      display_name: 'Coordinator',
      role_keys: ['coordinator'],
    }).roleKeys).toEqual(['coordinator'])
  })
})

describe('Projects guarded RPC adapter', () => {
  it('loads minimal assignment names through the guarded project RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: '44444444-4444-4444-8444-444444444444',
        project_id: projectId,
        user_id: coordinatorId,
        role_on_project: 'coordinator',
        assigned_at: '2026-07-16T16:00:00Z',
        assigned_by: pmId,
        assignment_reason: 'Field delivery assignment',
        unassigned_at: null,
        unassigned_by: null,
        unassignment_reason: null,
        display_name: 'Olivia Pope',
      }],
      error: null,
    })
    const api = createProjectsApi({ rpc })

    await expect(api.listAssignments(projectId, false)).resolves.toEqual([
      expect.objectContaining({
        user_id: coordinatorId,
        role_on_project: 'coordinator',
        profiles: { display_name: 'Olivia Pope' },
      }),
    ])
    expect(rpc).toHaveBeenCalledWith('rpc_list_project_assignments', {
      p_project_id: projectId,
      p_include_history: false,
    })
  })

  it('calls only guarded mutation RPCs with snake-case payloads', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: projectId, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: '55555555-5555-4555-8555-555555555555', error: null })
      .mockResolvedValue({ data: null, error: null })
    const api = createProjectsApi({ rpc })

    await api.create({
      project: {
        projectCode: ' prj-002 ',
        name: ' New Site ',
        clientName: ' Client B ',
        status: 'planned',
        healthStatus: 'on_track',
      },
      primaryPmId: pmId,
      coordinatorIds: [coordinatorId, coordinatorId],
      reason: ' Create approved project ',
    })
    await api.update(projectId, { healthStatus: 'at_risk' }, 'Record delivery risk')
    await api.assign(projectId, coordinatorId, 'coordinator', 'Add field lead')
    await api.unassign('44444444-4444-4444-8444-444444444444', 'Field handover')
    await api.saveDailyUpdate({
      updateId: null,
      projectId,
      updateDate: '2026-08-02',
      summary: ' Mobilisation complete ',
      photoUrls: [],
      submit: true,
    })
    await api.reviewDailyUpdate(
      '55555555-5555-4555-8555-555555555555',
      'request_revision',
      'Add labour count',
    )

    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'rpc_create_project',
      'rpc_update_project',
      'rpc_assign_project_member',
      'rpc_unassign_project_member',
      'rpc_save_daily_update',
      'rpc_review_daily_update',
    ])
    expect(rpc).toHaveBeenNthCalledWith(1, 'rpc_create_project', {
      p_project: {
        project_code: 'PRJ-002',
        name: 'New Site',
        client_name: 'Client B',
        status: 'planned',
        health_status: 'on_track',
      },
      p_primary_pm_id: pmId,
      p_coordinator_ids: [coordinatorId],
      p_reason: 'Create approved project',
    })
  })

  it('returns allow-listed actionable errors and hides unexpected diagnostics', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'active coordinator assignment is required' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'internal SQL leaked a private profile', details: 'secret' },
      })
    const api = createProjectsApi({ rpc })

    await expect(api.saveDailyUpdate({
      updateId: null,
      projectId,
      updateDate: '2026-08-02',
      summary: 'Update',
      photoUrls: [],
      submit: true,
    })).rejects.toThrow('active coordinator assignment is required')

    await expect(api.assign(
      projectId,
      coordinatorId,
      'coordinator',
      'Assign coordinator',
    )).rejects.toThrow('Project request could not be completed.')
  })
})
