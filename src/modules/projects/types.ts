export type ProjectStatus =
  | 'planned'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'cancelled'
  | 'archived'

export type ProjectHealth = 'on_track' | 'needs_attention' | 'at_risk'
export type ProjectRole = 'pm' | 'coordinator'
export type CandidateRole = 'project_manager' | 'coordinator'
export type DailyUpdateStatus =
  | 'draft'
  | 'submitted'
  | 'endorsed'
  | 'revision_requested'

export interface ProjectListItem {
  id: string
  projectCode: string
  name: string
  clientName: string | null
  siteLocation: string | null
  status: ProjectStatus
  healthStatus: ProjectHealth
  plannedStartDate: string | null
  expectedEndDate: string | null
  updatedAt: string
}

export interface ProjectDetail extends ProjectListItem {
  actualCompletionDate: string | null
  contractReference: string | null
  budgetReference: string | null
  operationalNotes: string | null
  estimatedBudgetUgx: number | null
  budgetNotes: string | null
  budgetSetBy: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
}

export interface ProjectAssignment {
  id: string
  projectId: string
  userId: string
  roleOnProject: ProjectRole
  assignedAt: string
  assignedBy: string
  assignmentReason: string
  unassignedAt: string | null
  unassignedBy: string | null
  unassignmentReason: string | null
  displayName?: string
}

export interface ProjectCandidate {
  profileId: string
  displayName: string
  roleKeys: CandidateRole[]
}

export interface DailyUpdate {
  id: string
  projectId: string
  submittedBy: string
  updateDate: string
  summary: string
  photoUrls: string[]
  status: DailyUpdateStatus
  pmFeedback: string | null
  endorsedBy: string | null
  endorsedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface DailyUpdateRevision {
  id: string
  dailyUpdateId: string
  summary: string
  photoUrls: string[]
  status: DailyUpdateStatus
  pmFeedback: string | null
  createdBy: string
  createdAt: string
}

export interface CreateProjectValues {
  projectCode: string
  name: string
  clientName?: string | null
  siteLocation?: string | null
  plannedStartDate?: string | null
  expectedEndDate?: string | null
  contractReference?: string | null
  budgetReference?: string | null
  operationalNotes?: string | null
  status?: ProjectStatus
  healthStatus?: ProjectHealth
  estimatedBudgetUgx?: number | null
  budgetNotes?: string | null
}

export interface CreateProjectCommand {
  project: CreateProjectValues
  primaryPmId: string | null
  coordinatorIds: string[]
  reason: string
}

export type UpdateProjectChanges = Partial<CreateProjectValues>

export interface SaveDailyUpdateCommand {
  updateId: string | null
  projectId: string
  updateDate: string
  summary: string
  photoUrls: string[]
  submit: boolean
}

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: () => [...projectQueryKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) =>
    [...projectQueryKeys.lists(), filters] as const,
  detail: (projectId: string) =>
    [...projectQueryKeys.all, 'detail', projectId] as const,
  assignments: (projectId: string) =>
    [...projectQueryKeys.detail(projectId), 'assignments'] as const,
  updates: (projectId: string) =>
    [...projectQueryKeys.detail(projectId), 'updates'] as const,
  revisions: (updateId: string) =>
    [...projectQueryKeys.all, 'update-revisions', updateId] as const,
}
