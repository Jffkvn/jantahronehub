import { getSupabaseClient } from '../../../lib/supabase/client'

export interface CashAdvanceRequest {
  id: string
  project_id: string
  user_id: string
  amount_requested: number
  purpose: string
  status: 'pending_approval' | 'approved' | 'disbursed' | 'completed' | 'rejected'
  requested_at: string
  entered_by: string
  approved_by: string | null
  approved_at: string | null
  disbursed_by: string | null
  disbursed_at: string | null
  amount_disbursed: number | null
  disbursement_reference: string | null
  closed_by: string | null
  closed_at: string | null
  override_reason: string | null
  created_at: string
  updated_at: string
  projects?: {
    name: string
  }
  profiles_user?: {
    display_name: string
  }
  profiles_entered_by?: {
    display_name: string
  }
  profiles_approved_by?: {
    display_name: string
  }
  profiles_disbursed_by?: {
    display_name: string
  }
  profiles_closed_by?: {
    display_name: string
  }
}

export interface CashAdvanceExpense {
  id: string
  cash_advance_id: string
  expense_date: string
  category: string
  amount: number
  vendor: string
  explanation: string
  receipt_url: string | null
  receipt_unavailable: boolean
  receipt_unavailable_explanation: string | null
  status: 'pending_review' | 'accepted' | 'rejected'
  reviewed_by: string | null
  reviewed_at: string | null
  rejection_reason: string | null
  profiles_reviewed_by?: {
    display_name: string
  }
}

export interface CashAdvanceReturn {
  id: string
  cash_advance_id: string
  return_date: string
  amount: number
  returned_by: string
  received_by: string
  receipt_reference: string
  notes: string | null
  profiles_returned_by?: {
    display_name: string
  }
  profiles_received_by?: {
    display_name: string
  }
}

export interface ProfileOption {
  id: string
  display_name: string
}

export interface ProjectOption {
  id: string
  name: string
}

export const cashApi = {
  getRequests: async (): Promise<CashAdvanceRequest[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('cash_advance_requests')
      .select(`
        *,
        projects (name),
        profiles_user: user_id (display_name),
        profiles_entered_by: entered_by (display_name),
        profiles_approved_by: approved_by (display_name),
        profiles_disbursed_by: disbursed_by (display_name),
        profiles_closed_by: closed_by (display_name)
      `)
      .order('requested_at', { ascending: false })

    if (error) throw error
    return (data as unknown as CashAdvanceRequest[]) || []
  },

  getRequest: async (id: string): Promise<CashAdvanceRequest | null> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('cash_advance_requests')
      .select(`
        *,
        projects (name),
        profiles_user: user_id (display_name),
        profiles_entered_by: entered_by (display_name),
        profiles_approved_by: approved_by (display_name),
        profiles_disbursed_by: disbursed_by (display_name),
        profiles_closed_by: closed_by (display_name)
      `)
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    return data as unknown as CashAdvanceRequest
  },

  getExpenses: async (advanceId: string): Promise<CashAdvanceExpense[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('cash_advance_expenses')
      .select(`
        *,
        profiles_reviewed_by: reviewed_by (display_name)
      `)
      .eq('cash_advance_id', advanceId)
      .order('expense_date', { ascending: true })

    if (error) throw error
    return (data as unknown as CashAdvanceExpense[]) || []
  },

  getReturns: async (advanceId: string): Promise<CashAdvanceReturn[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('cash_advance_returns')
      .select(`
        *,
        profiles_returned_by: returned_by (display_name),
        profiles_received_by: received_by (display_name)
      `)
      .eq('cash_advance_id', advanceId)
      .order('return_date', { ascending: true })

    if (error) throw error
    return (data as unknown as CashAdvanceReturn[]) || []
  },

  checkOutstandingAdvances: async (userId: string): Promise<boolean> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .rpc('has_outstanding_advances', { p_user_id: userId })

    if (error) throw error
    return !!data
  },

  getBalance: async (advanceId: string): Promise<number> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .rpc('get_cash_advance_balance', { p_advance_id: advanceId })

    if (error) throw error
    return Number(data || 0)
  },

  requestAdvance: async (project_id: string, user_id: string, amount: number, purpose: string): Promise<string> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .rpc('rpc_request_cash_advance', {
        p_project_id: project_id,
        p_user_id: user_id,
        p_amount: amount,
        p_purpose: purpose
      })

    if (error) throw error
    return data as string
  },

  approveAdvance: async (advanceId: string, overrideReason: string | null): Promise<void> => {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .rpc('rpc_approve_cash_advance', {
        p_advance_id: advanceId,
        p_override_reason: overrideReason
      })

    if (error) throw error
  },

  disburseAdvance: async (advanceId: string, amount: number, reference: string): Promise<void> => {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .rpc('rpc_disburse_cash_advance', {
        p_advance_id: advanceId,
        p_amount: amount,
        p_reference: reference
      })

    if (error) throw error
  },

  submitExpense: async (
    advanceId: string,
    date: string,
    category: string,
    amount: number,
    vendor: string,
    explanation: string,
    receiptUrl: string | null,
    receiptUnavailable: boolean,
    receiptUnavailableExplanation: string | null
  ): Promise<string> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .rpc('rpc_submit_cash_expense', {
        p_advance_id: advanceId,
        p_date: date,
        p_category: category,
        p_amount: amount,
        p_vendor: vendor,
        p_explanation: explanation,
        p_receipt_url: receiptUrl,
        p_receipt_unavailable: receiptUnavailable,
        p_receipt_unavailable_explanation: receiptUnavailableExplanation
      })

    if (error) throw error
    return data as string
  },

  reviewExpense: async (expenseId: string, accept: boolean, rejectionReason: string | null): Promise<void> => {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .rpc('rpc_review_cash_expense', {
        p_expense_id: expenseId,
        p_accept: accept,
        p_rejection_reason: rejectionReason
      })

    if (error) throw error
  },

  recordReturn: async (advanceId: string, date: string, amount: number, reference: string, notes: string | null): Promise<string> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .rpc('rpc_return_cash', {
        p_advance_id: advanceId,
        p_date: date,
        p_amount: amount,
        p_reference: reference,
        p_notes: notes
      })

    if (error) throw error
    return data as string
  },

  closeAdvance: async (advanceId: string): Promise<void> => {
    const supabase = getSupabaseClient()
    const { error } = await supabase
      .rpc('rpc_close_cash_advance', {
        p_advance_id: advanceId
      })

    if (error) throw error
  },

  getOperationalProjects: async (): Promise<ProjectOption[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .in('status', ['planned', 'active', 'on_hold'])
      .order('name')

    if (error) throw error
    return (data as unknown as ProjectOption[]) || []
  },

  getActiveProfiles: async (): Promise<ProfileOption[]> => {
    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('status', 'active')
      .order('display_name')

    if (error) throw error
    return (data as unknown as ProfileOption[]) || []
  }
}
