export interface NotificationLogicDeps {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  supabase: any
  resendApiKey: string
  resendFromEmail: string
  webhookSecret: string
  requestSecret: string | null
  fetchFn: typeof fetch
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export async function handleNotificationDelivery(
  body: Record<string, unknown>,
  deps: NotificationLogicDeps
): Promise<{ success: boolean; status?: string; error?: string; statusCode: number }> {
  const { supabase, resendApiKey, resendFromEmail, webhookSecret, requestSecret, fetchFn } = deps

  // 1. Verify webhook secret
  if (!requestSecret || requestSecret !== webhookSecret) {
    return { success: false, error: 'Unauthorized', statusCode: 401 }
  }

  // 2. Validate payload
  const { notification_id } = body || {}
  if (!notification_id) {
    return { success: false, error: 'Invalid payload', statusCode: 400 }
  }

  // 3. Enforce idempotency (check outbox status)
  const { data: delivery } = await supabase
    .from('notification_deliveries')
    .select('status, attempt_count')
    .eq('notification_id', notification_id)
    .eq('channel', 'email')
    .maybeSingle()

  if (delivery && (delivery.status === 'sent' || delivery.status === 'skipped')) {
    return { success: true, status: 'already_processed', statusCode: 200 }
  }

  const nextAttempt = (delivery?.attempt_count ?? 0) + 1

  const updateOutbox = async (status: 'sent' | 'failed' | 'skipped', errorCode?: string) => {
    await supabase.from('notification_deliveries').upsert({
      notification_id,
      channel: 'email',
      status,
      attempt_count: nextAttempt,
      last_error_code: errorCode ?? null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'notification_id,channel' })
  };

  // 4. Fetch canonical notification data server-side
  const { data: notification, error: notifError } = await supabase
    .from('notifications')
    .select('id, recipient_profile_id, title, message, category, is_read')
    .eq('id', notification_id)
    .maybeSingle()

  if (notifError || !notification) {
    return { success: false, error: 'Notification not found', statusCode: 404 }
  }

  // 5. Skip if already read in-app
  if (notification.is_read) {
    await updateOutbox('skipped', 'ALREADY_READ')
    return { success: true, status: 'skipped_read', statusCode: 200 }
  }

  // 6. Fetch recipient user email securely
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(notification.recipient_profile_id)
  if (userError || !userData?.user?.email) {
    await updateOutbox('failed', 'EMAIL_NOT_FOUND')
    return { success: false, error: 'Recipient email not found', statusCode: 400 }
  }

  const email = userData.user.email

  // 7. Check if email is disabled/not configured
  if (!resendApiKey || resendApiKey === 'placeholder') {
    await updateOutbox('skipped', 'EMAIL_DELIVERY_DISABLED')
    return { success: true, status: 'disabled', statusCode: 200 }
  }

  // 8. Escape content to prevent HTML injection
  const safeTitle = escapeHtml(notification.title)
  const safeMessage = escapeHtml(notification.message)

  // 9. Dispatch to Resend API
  const response = await fetchFn('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendApiKey}`
    },
    body: JSON.stringify({
      from: resendFromEmail,
      to: [email],
      subject: safeTitle,
      html: `<div style="font-family: sans-serif; padding: 20px; line-height: 1.5;">
        <h2 style="color: #0d9488;">${safeTitle}</h2>
        <p>${safeMessage}</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <small style="color: #6b7280;">This is an automated notification from Egypro OneHub 2.0. Please do not reply.</small>
      </div>`
    })
  })

  if (!response.ok) {
    await updateOutbox('failed', 'RESEND_DISPATCH_ERROR')
    return { success: false, error: 'Resend delivery failed', statusCode: 500 }
  }

  // 10. Update outbox to sent
  await updateOutbox('sent')
  return { success: true, statusCode: 200 }
}
