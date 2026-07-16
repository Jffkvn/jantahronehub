import { z } from 'zod'

import { getSupabaseClient } from '../../../lib/supabase/client'
import {
  createProjectCommandSchema,
  projectSchema,
  saveDailyUpdateCommandSchema,
  updateProjectCommandSchema,
} from '../schemas/project'
import type {
  CreateProjectCommand,
  ProjectCandidate,
  ProjectDetail,
  ProjectRole,
  SaveDailyUpdateCommand,
  UpdateProjectChanges,
} from '../types'

export * from '../types'

// Temporary database-shaped read types retained for the existing Tracker pages.
// Protected writes below are RPC-only; the dedicated Projects pages use the
// camel-case models exported from types.ts.
export interface Project {
  id: string
  project_code?: string
  name: string
  client_name?: string | null
  site_location: string | null
  planned_start_date?: string | null
  expected_end_date?: string | null
  actual_completion_date?: string | null
  contract_reference?: string | null
  budget_reference?: string | null
  operational_notes?: string | null
  status: 'planned' | 'active' | 'completed' | 'on_hold' | 'cancelled' | 'archived'
  estimated_budget_ugx: number | null
  budget_notes: string | null
  health_status: 'on_track' | 'needs_attention' | 'at_risk'
  budget_set_by: string | null
  created_by: string
  updated_by?: string
  created_at: string
  updated_at: string
  profiles_budget_set_by?: { display_name: string }
  profiles_created_by?: { display_name: string }
}

export interface ProjectAssignment {
  id: string
  project_id: string
  user_id: string
  role_on_project: ProjectRole
  assigned_at: string
  assigned_by?: string
  assignment_reason?: string
  unassigned_at: string | null
  unassigned_by?: string | null
  unassignment_reason?: string | null
  profiles?: { display_name: string }
}

export interface DailyUpdate {
  id: string
  project_id: string
  submitted_by: string
  update_date: string
  summary: string
  photo_urls: string[]
  status: 'draft' | 'submitted' | 'endorsed' | 'revision_requested'
  pm_feedback: string | null
  endorsed_by: string | null
  endorsed_at: string | null
  created_at: string
  updated_at: string
  profiles_submitted_by?: { display_name: string }
  profiles_endorsed_by?: { display_name: string }
  projects?: { name: string }
}

export interface DailyUpdateRevision {
  id: string
  daily_update_id: string
  summary: string
  photo_urls: string[]
  status: string
  pm_feedback: string | null
  created_by: string
  created_at: string
  profiles_created_by?: { display_name: string }
}

export interface MissedUpdateRecord {
  project_id: string
  project_name: string
  user_id: string
  user_full_name: string
}

const candidateSchema = z.object({
  profile_id: z.uuid(),
  display_name: z.string().trim().min(1),
  role_keys: z.array(z.enum(['project_manager', 'coordinator'])),
})

export function parseProjectRow(value: unknown): ProjectDetail {
  const row = projectSchema.parse(value)
  return {
    id: row.id,
    projectCode: row.project_code,
    name: row.name,
    clientName: row.client_name,
    siteLocation: row.site_location,
    plannedStartDate: row.planned_start_date,
    expectedEndDate: row.expected_end_date,
    actualCompletionDate: row.actual_completion_date,
    contractReference: row.contract_reference,
    budgetReference: row.budget_reference,
    operationalNotes: row.operational_notes,
    status: row.status,
    healthStatus: row.health_status,
    estimatedBudgetUgx: row.estimated_budget_ugx,
    budgetNotes: row.budget_notes,
    budgetSetBy: row.budget_set_by,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function parseProjectCandidate(value: unknown): ProjectCandidate {
  const candidate = candidateSchema.parse(value)
  return {
    profileId: candidate.profile_id,
    displayName: candidate.display_name,
    roleKeys: candidate.role_keys,
  }
}

interface RpcResult {
  data: unknown
  error: unknown
}

export interface ProjectsRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): PromiseLike<RpcResult>
}

const exposedDatabaseMessages = new Set([
  'projects.create permission is required',
  'projects.assign_all permission is required',
  'projects.assign_all permission is required to assign the primary PM',
  'active primary PM assignment is required to update the project',
  'active primary PM assignment is required to manage coordinators',
  'active primary PM assignment is required to review the update',
  'active coordinator assignment is required',
  'Project Managers must assign themselves as the primary PM',
  'primary PM candidate must hold the project_manager role',
  'project coordinator candidate must hold the coordinator role',
  'status transition requires the guarded project transition workflow',
  'project code or active assignment already exists',
  'project not found',
  'project assignment read access is required',
  'daily update not found',
  'only the assigned original coordinator may revise this update',
  'feedback is required when requesting a revision',
  'change reason must contain between 3 and 500 characters',
])

function safeRequestError(error: unknown): Error {
  if (
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof error.message === 'string'
    && exposedDatabaseMessages.has(error.message)
  ) {
    return new Error(error.message)
  }
  return new Error('Project request could not be completed.')
}

function compactProjectPayload(project: CreateProjectCommand['project']) {
  return Object.fromEntries(Object.entries({
    project_code: project.projectCode,
    name: project.name,
    client_name: project.clientName,
    site_location: project.siteLocation,
    planned_start_date: project.plannedStartDate,
    expected_end_date: project.expectedEndDate,
    contract_reference: project.contractReference,
    budget_reference: project.budgetReference,
    operational_notes: project.operationalNotes,
    status: project.status,
    health_status: project.healthStatus,
    estimated_budget_ugx: project.estimatedBudgetUgx,
    budget_notes: project.budgetNotes,
  }).filter(([, value]) => value !== undefined))
}

function compactChanges(changes: UpdateProjectChanges) {
  return compactProjectPayload(changes as CreateProjectCommand['project'])
}

export interface ProjectsApi {
  listCandidates(): Promise<ProjectCandidate[]>
  listAssignments(projectId: string, includeHistory: boolean): Promise<ProjectAssignment[]>
  create(command: CreateProjectCommand): Promise<string>
  update(projectId: string, changes: UpdateProjectChanges, reason: string): Promise<void>
  assign(projectId: string, userId: string, role: ProjectRole, reason: string): Promise<void>
  unassign(assignmentId: string, reason: string): Promise<void>
  saveDailyUpdate(command: SaveDailyUpdateCommand): Promise<string>
  reviewDailyUpdate(
    updateId: string,
    decision: 'endorse' | 'request_revision',
    feedback: string | null,
  ): Promise<void>
}

export function createProjectsApi(
  client: ProjectsRpcClient =
    getSupabaseClient() as unknown as ProjectsRpcClient,
): ProjectsApi {
  async function rpc(name: string, parameters?: Record<string, unknown>) {
    const { data, error } = await client.rpc(name, parameters)
    if (error) throw safeRequestError(error)
    return data
  }

  return {
    async listCandidates() {
      const data = await rpc('rpc_list_project_assignment_candidates')
      return z.array(z.unknown()).parse(data).map(parseProjectCandidate)
    },
    async listAssignments(projectId, includeHistory) {
      const data = await rpc('rpc_list_project_assignments', {
        p_project_id: z.uuid().parse(projectId),
        p_include_history: includeHistory,
      })
      return z.array(z.object({
        id: z.uuid(),
        project_id: z.uuid(),
        user_id: z.uuid(),
        role_on_project: z.enum(['pm', 'coordinator']),
        assigned_at: z.string(),
        assigned_by: z.uuid().optional(),
        assignment_reason: z.string().optional(),
        unassigned_at: z.string().nullable(),
        unassigned_by: z.uuid().nullable().optional(),
        unassignment_reason: z.string().nullable().optional(),
        display_name: z.string().trim().min(1),
      })).parse(data).map(({ display_name, ...assignment }) => ({
        ...assignment,
        profiles: { display_name },
      }))
    },
    async create(command) {
      const parsed = createProjectCommandSchema.parse(command)
      const id = await rpc('rpc_create_project', {
        p_project: compactProjectPayload(parsed.project),
        p_primary_pm_id: parsed.primaryPmId,
        p_coordinator_ids: parsed.coordinatorIds,
        p_reason: parsed.reason,
      })
      return z.uuid().parse(id)
    },
    async update(projectId, changes, reason) {
      const parsed = updateProjectCommandSchema.parse({ projectId, changes, reason })
      await rpc('rpc_update_project', {
        p_project_id: parsed.projectId,
        p_changes: compactChanges(parsed.changes),
        p_reason: parsed.reason,
      })
    },
    async assign(projectId, userId, role, reason) {
      await rpc('rpc_assign_project_member', {
        p_project_id: z.uuid().parse(projectId),
        p_user_id: z.uuid().parse(userId),
        p_project_role: z.enum(['pm', 'coordinator']).parse(role),
        p_reason: z.string().trim().min(3).max(500).parse(reason),
      })
    },
    async unassign(assignmentId, reason) {
      await rpc('rpc_unassign_project_member', {
        p_assignment_id: z.uuid().parse(assignmentId),
        p_reason: z.string().trim().min(3).max(500).parse(reason),
      })
    },
    async saveDailyUpdate(command) {
      const parsed = saveDailyUpdateCommandSchema.parse(command)
      const id = await rpc('rpc_save_daily_update', {
        p_update_id: parsed.updateId,
        p_project_id: parsed.projectId,
        p_update_date: parsed.updateDate,
        p_summary: parsed.summary,
        p_photo_urls: parsed.photoUrls,
        p_submit: parsed.submit,
      })
      return z.uuid().parse(id)
    },
    async reviewDailyUpdate(updateId, decision, feedback) {
      await rpc('rpc_review_daily_update', {
        p_update_id: z.uuid().parse(updateId),
        p_decision: z.enum(['endorse', 'request_revision']).parse(decision),
        p_feedback: feedback === null ? null : z.string().trim().parse(feedback),
      })
    },
  }
}

const guardedApi = createProjectsApi()
const legacyReason = 'Action requested from the existing Daily Tracker interface'

export const projectsApi = {
  ...guardedApi,
  async getProjects(): Promise<Project[]> {
    const { data, error } = await getSupabaseClient()
      .from('projects')
      .select('*, profiles_budget_set_by:profiles!budget_set_by(display_name), profiles_created_by:profiles!created_by(display_name)')
      .order('created_at', { ascending: false })
    if (error) throw safeRequestError(error)
    return data as unknown as Project[]
  },
  async getProject(projectId: string): Promise<Project | null> {
    const { data, error } = await getSupabaseClient()
      .from('projects')
      .select('*, profiles_budget_set_by:profiles!budget_set_by(display_name), profiles_created_by:profiles!created_by(display_name)')
      .eq('id', projectId)
      .maybeSingle()
    if (error) throw safeRequestError(error)
    return data as unknown as Project | null
  },
  async getAssignments(projectId: string): Promise<ProjectAssignment[]> {
    return guardedApi.listAssignments(projectId, false)
  },
  async getAssignmentHistory(projectId: string): Promise<ProjectAssignment[]> {
    return guardedApi.listAssignments(projectId, true)
  },
  async getDailyUpdates(projectId?: string): Promise<DailyUpdate[]> {
    let query = getSupabaseClient()
      .from('daily_updates')
      .select('*, profiles_submitted_by:profiles!submitted_by(display_name), profiles_endorsed_by:profiles!endorsed_by(display_name), projects:project_id(name)')
      .order('update_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (projectId) query = query.eq('project_id', projectId)
    const { data, error } = await query
    if (error) throw safeRequestError(error)
    return data as unknown as DailyUpdate[]
  },
  async getDailyUpdateRevisions(updateId: string): Promise<DailyUpdateRevision[]> {
    const { data, error } = await getSupabaseClient()
      .from('daily_update_revisions')
      .select('*, profiles_created_by:profiles!created_by(display_name)')
      .eq('daily_update_id', updateId)
      .order('created_at', { ascending: false })
    if (error) throw safeRequestError(error)
    return data as unknown as DailyUpdateRevision[]
  },
  async checkMissedDailyUpdates(date: string): Promise<MissedUpdateRecord[]> {
    const { data, error } = await getSupabaseClient()
      .rpc('rpc_check_missed_daily_updates', { p_date: date })
    if (error) throw safeRequestError(error)
    return data as unknown as MissedUpdateRecord[]
  },
  async getProfiles() {
    const candidates = await guardedApi.listCandidates()
    return candidates.map((candidate) => ({
      id: candidate.profileId,
      display_name: candidate.displayName,
    }))
  },

  // Compatibility methods are RPC-backed and disappear with the legacy tabs.
  async createProject(project: Omit<Project, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'budget_set_by'>) {
    const id = await guardedApi.create({
      project: {
        projectCode: project.project_code ?? `PRJ-${Date.now()}`,
        name: project.name,
        siteLocation: project.site_location,
        status: project.status,
        healthStatus: project.health_status,
        estimatedBudgetUgx: project.estimated_budget_ugx,
        budgetNotes: project.budget_notes,
      },
      primaryPmId: null,
      coordinatorIds: [],
      reason: legacyReason,
    })
    return (await projectsApi.getProject(id)) as Project
  },
  async updateProject(projectId: string, changes: Partial<Project>) {
    await guardedApi.update(projectId, {
      name: changes.name,
      siteLocation: changes.site_location,
      status: changes.status,
      healthStatus: changes.health_status,
      estimatedBudgetUgx: changes.estimated_budget_ugx,
      budgetNotes: changes.budget_notes,
    }, legacyReason)
    return (await projectsApi.getProject(projectId)) as Project
  },
  async assignUser(projectId: string, userId: string, role: ProjectRole) {
    await guardedApi.assign(projectId, userId, role, legacyReason)
  },
  async unassignUser(assignmentId: string) {
    await guardedApi.unassign(assignmentId, legacyReason)
  },
  async createDailyUpdate(update: Omit<DailyUpdate, 'id' | 'submitted_by' | 'created_at' | 'updated_at' | 'endorsed_by' | 'endorsed_at' | 'pm_feedback'>) {
    await guardedApi.saveDailyUpdate({
      updateId: null,
      projectId: update.project_id,
      updateDate: update.update_date,
      summary: update.summary,
      photoUrls: update.photo_urls,
      submit: update.status === 'submitted',
    })
  },
  async updateDailyUpdate(updateId: string, changes: Partial<DailyUpdate>) {
    const { data, error } = await getSupabaseClient()
      .from('daily_updates')
      .select('project_id, update_date, summary, photo_urls, status')
      .eq('id', updateId)
      .single()
    if (error) throw safeRequestError(error)
    const existing = data as Pick<DailyUpdate, 'project_id' | 'update_date' | 'summary' | 'photo_urls' | 'status'>
    await guardedApi.saveDailyUpdate({
      updateId,
      projectId: existing.project_id,
      updateDate: existing.update_date,
      summary: changes.summary ?? existing.summary,
      photoUrls: changes.photo_urls ?? existing.photo_urls,
      submit: (changes.status ?? existing.status) === 'submitted',
    })
  },
  async endorseDailyUpdate(updateId: string, feedback: string | null) {
    await guardedApi.reviewDailyUpdate(updateId, 'endorse', feedback)
  },
  async requestDailyUpdateRevision(updateId: string, feedback: string) {
    await guardedApi.reviewDailyUpdate(updateId, 'request_revision', feedback)
  },
}
