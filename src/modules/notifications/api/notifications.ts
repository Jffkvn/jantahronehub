import { getSupabaseClient } from '../../../lib/supabase/client'

export interface Notification {
  id: string
  recipient_profile_id: string
  title: string
  message: string
  is_read: boolean
  category: 'general' | 'hr' | 'payroll' | 'warehouse' | 'project' | 'cash'
  created_at: string
}

export const notificationsApi = {
  async listNotifications(): Promise<Notification[]> {
    const { data, error } = await getSupabaseClient()
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    return (data || []) as Notification[]
  },

  async markAsRead(notificationId: string): Promise<void> {
    const { error } = await getSupabaseClient().rpc('mark_notification_as_read', {
      p_notification_id: notificationId
    })
    if (error) throw error
  },

  async markAllAsRead(): Promise<void> {
    const { error } = await getSupabaseClient().rpc('mark_all_notifications_as_read')
    if (error) throw error
  }
}
