export interface NotificationLogicDeps {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  supabase: any
  resendApiKey: string
  resendFromEmail: string
  webhookSecret: string
  requestSecret: string | null
  fetchFn: typeof fetch
}

interface DeliveryClaim {
  id: string
  notification_id: string
  claim_token: string
  provider_idempotency_key: string
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

  if (!webhookSecret) {
    return { success: false, error: 'Notification delivery is not configured', statusCode: 503 }
  }
  if (!requestSecret || requestSecret !== webhookSecret) {
    return { success: false, error: 'Unauthorized', statusCode: 401 }
  }
  if (!resendApiKey || !resendFromEmail || resendApiKey === 'placeholder') {
    return { success: false, error: 'Email provider is not configured', statusCode: 503 }
  }

  const notificationId = typeof body?.notification_id === 'string' ? body.notification_id : ''
  if (!notificationId) {
    return { success: false, error: 'Invalid payload', statusCode: 400 }
  }

  const { data: claimData, error: claimError } = await supabase.rpc('claim_notification_delivery', {
    target_notification_id: notificationId,
    target_channel: 'email'
  })
  if (claimError) {
    return { success: false, error: 'Delivery could not be claimed', statusCode: 500 }
  }
  if (!claimData) {
    return { success: true, status: 'already_claimed', statusCode: 200 }
  }

  const claim = claimData as DeliveryClaim
  const complete = async (
    status: 'sent' | 'failed' | 'skipped',
    errorCode: string | null = null,
    providerMessageId: string | null = null
  ) => {
    const { data, error } = await supabase.rpc('complete_notification_delivery', {
      target_delivery_id: claim.id,
      target_claim_token: claim.claim_token,
      completion_status: status,
      completion_error_code: errorCode,
      completion_provider_message_id: providerMessageId
    })
    return !error && data === true
  }

  const { data: notification, error: notificationError } = await supabase
    .from('notifications')
    .select('id, recipient_profile_id, title, message, category, is_read')
    .eq('id', notificationId)
    .maybeSingle()

  if (notificationError || !notification) {
    await complete('failed', 'NOTIFICATION_NOT_FOUND')
    return { success: false, error: 'Notification not found', statusCode: 404 }
  }
  if (notification.is_read) {
    await complete('skipped', 'ALREADY_READ')
    return { success: true, status: 'skipped_read', statusCode: 200 }
  }

  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(
    notification.recipient_profile_id
  )
  if (userError || !userData?.user?.email) {
    await complete('failed', 'EMAIL_NOT_FOUND')
    return { success: false, error: 'Recipient email not found', statusCode: 400 }
  }

  const safeTitle = escapeHtml(notification.title)
  const safeMessage = escapeHtml(notification.message)
  let response: Response
  try {
    response = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': claim.provider_idempotency_key
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [userData.user.email],
        subject: safeTitle,
        html: `<div style="font-family: sans-serif; padding: 20px; line-height: 1.5;">
          <h2 style="color: #0d9488;">${safeTitle}</h2>
          <p>${safeMessage}</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <small style="color: #6b7280;">This is an automated notification from Egypro OneHub 2.0. Please do not reply.</small>
        </div>`
      })
    })
  } catch {
    await complete('failed', 'RESEND_NETWORK_ERROR')
    return { success: false, error: 'Resend delivery failed', statusCode: 502 }
  }

  if (!response.ok) {
    await complete('failed', 'RESEND_DISPATCH_ERROR')
    return { success: false, error: 'Resend delivery failed', statusCode: 502 }
  }

  let providerMessageId: string | null = null
  try {
    const responseBody = await response.json() as { id?: unknown }
    providerMessageId = typeof responseBody.id === 'string' ? responseBody.id : null
  } catch {
    // The send succeeded; a missing provider receipt must not cause a duplicate retry.
  }

  if (!(await complete('sent', null, providerMessageId))) {
    return { success: false, error: 'Delivery completion could not be recorded', statusCode: 500 }
  }

  return { success: true, status: 'sent', statusCode: 200 }
}
