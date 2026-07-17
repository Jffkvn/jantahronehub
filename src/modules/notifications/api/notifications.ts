import { getSupabaseClient } from '../../../lib/supabase/client'

export interface Notification {
  id: string
  recipient_profile_id: string
  title: string
  message: string
  is_read: boolean
  category: 'general' | 'hr' | 'payroll' | 'warehouse' | 'project' | 'cash'
  created_at: string
  action_path: string | null
}

export type NotificationCategory = Notification['category']

export interface NotificationPreference {
  profile_id: string
  category: NotificationCategory
  email_enabled: boolean
}

export const notificationsApi = {
  async listNotifications(): Promise<Notification[]> {
    const { data, error } = await getSupabaseClient()
      .from('notifications')
      .select('id, recipient_profile_id, title, message, is_read, category, created_at, action_path')
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
  },

  async listPreferences(): Promise<NotificationPreference[]> {
    const { data, error } = await getSupabaseClient()
      .from('notification_preferences')
      .select('profile_id, category, email_enabled')
      .order('category')
    if (error) throw error
    return (data || []) as NotificationPreference[]
  },

  async setEmailPreference(category: NotificationCategory, enabled: boolean): Promise<void> {
    const { error } = await getSupabaseClient().rpc('set_notification_email_preference', {
      preference_category: category,
      preference_enabled: enabled
    })
    if (error) throw error
  }
}
