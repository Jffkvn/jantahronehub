import { getSupabaseClient } from '../../../lib/supabase/client'

export interface Project {
  id: string
  name: string
  site_location: string | null
  status: 'active' | 'completed' | 'on_hold'
  estimated_budget_ugx: number | null
  budget_notes: string | null
  health_status: 'on_track' | 'needs_attention' | 'at_risk'
  budget_set_by: string | null
  created_by: string
  created_at: string
  updated_at: string
  profiles_budget_set_by?: { display_name: string }
  profiles_created_by?: { display_name: string }
}

export interface ProjectAssignment {
  id: string
  project_id: string
  user_id: string
  role_on_project: 'coordinator' | 'pm'
  assigned_at: string
  unassigned_at: string | null
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

export const projectsApi = {
  getProjects: async (): Promise<Project[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        profiles_budget_set_by:profiles!budget_set_by (display_name),
        profiles_created_by:profiles!created_by (display_name)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as Project[]
  },

  getProject: async (projectId: string): Promise<Project | null> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        profiles_budget_set_by:profiles!budget_set_by (display_name),
        profiles_created_by:profiles!created_by (display_name)
      `)
      .eq('id', projectId)
      .maybeSingle()

    if (error) throw error
    return data as Project | null
  },

  createProject: async (project: Omit<Project, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'budget_set_by'>): Promise<Project> => {
    const supabase = getSupabaseClient()
    const sessionUser = (await supabase.auth.getUser()).data.user
    if (!sessionUser) throw new Error('Unauthenticated')

    const { data, error } = await supabase
      .from('projects')
      .insert([{
        ...project,
        created_by: sessionUser.id,
        budget_set_by: project.estimated_budget_ugx ? sessionUser.id : null
      }])
      .select(`
        *,
        profiles_budget_set_by:profiles!budget_set_by (display_name),
        profiles_created_by:profiles!created_by (display_name)
      `)
      .single()

    if (error) throw error
    return data as Project
  },

  updateProject: async (projectId: string, updates: Partial<Project>): Promise<Project> => {
    const supabase = getSupabaseClient()
    const sessionUser = (await supabase.auth.getUser()).data.user
    if (!sessionUser) throw new Error('Unauthenticated')

    const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() }
    if (updates.estimated_budget_ugx !== undefined) {
      payload.budget_set_by = sessionUser.id
    }

    const { data, error } = await supabase
      .from('projects')
      .update(payload)
      .eq('id', projectId)
      .select(`
        *,
        profiles_budget_set_by:profiles!budget_set_by (display_name),
        profiles_created_by:profiles!created_by (display_name)
      `)
      .single()

    if (error) throw error
    return data as Project
  },

  getAssignments: async (projectId: string): Promise<ProjectAssignment[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('project_assignments')
      .select(`
        *,
        profiles:user_id (display_name)
      `)
      .eq('project_id', projectId)
      .is('unassigned_at', null)

    if (error) throw error
    return data as unknown as ProjectAssignment[]
  },

  assignUser: async (projectId: string, userId: string, roleOnProject: 'coordinator' | 'pm'): Promise<ProjectAssignment> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('project_assignments')
      .insert([{
        project_id: projectId,
        user_id: userId,
        role_on_project: roleOnProject
      }])
      .select(`
        *,
        profiles:user_id (display_name)
      `)
      .single()

    if (error) throw error
    return data as unknown as ProjectAssignment
  },

  unassignUser: async (assignmentId: string): Promise<void> => {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .from('project_assignments')
      .update({ unassigned_at: new Date().toISOString() })
      .eq('id', assignmentId)

    if (error) throw error
  },

  getDailyUpdates: async (projectId?: string): Promise<DailyUpdate[]> => {
    const supabase = getSupabaseClient()
    let query = supabase
      .from('daily_updates')
      .select(`
        *,
        profiles_submitted_by:profiles!submitted_by (display_name),
        profiles_endorsed_by:profiles!endorsed_by (display_name),
        projects:project_id (name)
      `)
      .order('update_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data, error } = await query
    if (error) throw error
    return data as DailyUpdate[]
  },

  createDailyUpdate: async (update: Omit<DailyUpdate, 'id' | 'submitted_by' | 'created_at' | 'updated_at' | 'endorsed_by' | 'endorsed_at' | 'pm_feedback'>): Promise<DailyUpdate> => {
    const supabase = getSupabaseClient()
    const sessionUser = (await supabase.auth.getUser()).data.user
    if (!sessionUser) throw new Error('Unauthenticated')

    const { data, error } = await supabase
      .from('daily_updates')
      .insert([{
        ...update,
        submitted_by: sessionUser.id
      }])
      .select(`
        *,
        profiles_submitted_by:profiles!submitted_by (display_name),
        profiles_endorsed_by:profiles!endorsed_by (display_name),
        projects:project_id (name)
      `)
      .single()

    if (error) throw error
    return data as DailyUpdate
  },

  updateDailyUpdate: async (updateId: string, updates: Partial<DailyUpdate>): Promise<DailyUpdate> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('daily_updates')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', updateId)
      .select(`
        *,
        profiles_submitted_by:profiles!submitted_by (display_name),
        profiles_endorsed_by:profiles!endorsed_by (display_name),
        projects:project_id (name)
      `)
      .single()

    if (error) throw error
    return data as DailyUpdate
  },

  endorseDailyUpdate: async (updateId: string, pmFeedback: string | null): Promise<DailyUpdate> => {
    const supabase = getSupabaseClient()
    const sessionUser = (await supabase.auth.getUser()).data.user
    if (!sessionUser) throw new Error('Unauthenticated')

    const { data, error } = await supabase
      .from('daily_updates')
      .update({
        status: 'endorsed',
        endorsed_by: sessionUser.id,
        endorsed_at: new Date().toISOString(),
        pm_feedback: pmFeedback
      })
      .eq('id', updateId)
      .select(`
        *,
        profiles_submitted_by:profiles!submitted_by (display_name),
        profiles_endorsed_by:profiles!endorsed_by (display_name),
        projects:project_id (name)
      `)
      .single()

    if (error) throw error
    return data as DailyUpdate
  },

  requestDailyUpdateRevision: async (updateId: string, pmFeedback: string): Promise<DailyUpdate> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('daily_updates')
      .update({
        status: 'revision_requested',
        pm_feedback: pmFeedback
      })
      .eq('id', updateId)
      .select(`
        *,
        profiles_submitted_by:profiles!submitted_by (display_name),
        profiles_endorsed_by:profiles!endorsed_by (display_name),
        projects:project_id (name)
      `)
      .single()

    if (error) throw error
    return data as DailyUpdate
  },

  getDailyUpdateRevisions: async (updateId: string): Promise<DailyUpdateRevision[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('daily_update_revisions')
      .select(`
        *,
        profiles_created_by:profiles!created_by (display_name)
      `)
      .eq('daily_update_id', updateId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as DailyUpdateRevision[]
  },

  checkMissedDailyUpdates: async (dateStr: string): Promise<MissedUpdateRecord[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .rpc('rpc_check_missed_daily_updates', { p_date: dateStr })

    if (error) throw error
    return data as MissedUpdateRecord[]
  },

  getProfiles: async (): Promise<Array<{ id: string; display_name: string }>> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('status', 'active')
      .order('display_name')

    if (error) throw error
    return data as Array<{ id: string; display_name: string }>
  }
}
