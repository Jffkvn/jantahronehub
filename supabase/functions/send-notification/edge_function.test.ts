import { beforeEach, describe, expect, it, vi } from 'vitest'
import { escapeHtml, handleNotificationDelivery } from './notification_logic'

describe('send-notification delivery logic', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let supabase: any
  let fetchFn: any
  let deps: any
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const claim = {
    id: 'delivery-1',
    notification_id: 'notif-1',
    claim_token: 'claim-1',
    provider_idempotency_key: 'notification:notif-1:email'
  }
  const notification = {
    id: 'notif-1', recipient_profile_id: 'user-123', title: 'Notice',
    message: 'Message', category: 'general', is_read: false
  }

  beforeEach(() => {
    supabase = {
      rpc: vi.fn()
        .mockResolvedValueOnce({ data: claim, error: null })
        .mockResolvedValue({ data: true, error: null }),
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: notification, error: null }),
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'user@example.invalid' } }, error: null }) } }
    }
    fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'resend-1' }) })
    deps = {
      supabase,
      resendApiKey: 'resend-key',
      resendFromEmail: 'OneHub <notifications@example.invalid>',
      webhookSecret: 'webhook-secret',
      requestSecret: 'webhook-secret',
      fetchFn
    }
  })

  it('fails closed when webhook authentication is not configured', async () => {
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, { ...deps, webhookSecret: '', requestSecret: null })
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 503, error: 'Notification delivery is not configured' }))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects an invalid webhook secret', async () => {
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, { ...deps, requestSecret: 'wrong' })
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 401, error: 'Unauthorized' }))
  })

  it('fails closed when provider credentials or sender are missing', async () => {
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, { ...deps, resendApiKey: '', resendFromEmail: '' })
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 503, error: 'Email provider is not configured' }))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects a missing notification id before claiming', async () => {
    const result = await handleNotificationDelivery({}, deps)
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 400, error: 'Invalid payload' }))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('returns a safe error when the atomic claim fails', async () => {
    supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('database unavailable') })
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 500, error: 'Delivery could not be claimed' }))
  })

  it('ignores a second worker when no delivery is claimable', async () => {
    supabase.rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual({ success: true, status: 'already_claimed', statusCode: 200 })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('records a missing canonical notification as failed', async () => {
    supabase.maybeSingle.mockResolvedValue({ data: null, error: null })
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 404 }))
    expect(supabase.rpc).toHaveBeenLastCalledWith('complete_notification_delivery', expect.objectContaining({ completion_status: 'failed', completion_error_code: 'NOTIFICATION_NOT_FOUND' }))
  })

  it('records an already-read notification as skipped', async () => {
    supabase.maybeSingle.mockResolvedValue({ data: { ...notification, is_read: true }, error: null })
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual({ success: true, status: 'skipped_read', statusCode: 200 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('complete_notification_delivery', expect.objectContaining({ completion_status: 'skipped', completion_error_code: 'ALREADY_READ' }))
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('records a recipient without email as failed', async () => {
    supabase.auth.admin.getUserById.mockResolvedValue({ data: null, error: new Error('missing') })
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual(expect.objectContaining({ success: false, statusCode: 400, error: 'Recipient email not found' }))
    expect(supabase.rpc).toHaveBeenLastCalledWith('complete_notification_delivery', expect.objectContaining({ completion_error_code: 'EMAIL_NOT_FOUND' }))
  })

  it('uses a stable provider key and records the provider message id', async () => {
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual({ success: true, status: 'sent', statusCode: 200 })
    expect(fetchFn).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      headers: expect.objectContaining({ 'Idempotency-Key': 'notification:notif-1:email' })
    }))
    expect(supabase.rpc).toHaveBeenLastCalledWith('complete_notification_delivery', expect.objectContaining({
      completion_status: 'sent', completion_provider_message_id: 'resend-1'
    }))
  })

  it('records provider failure without exposing its response', async () => {
    fetchFn.mockResolvedValue({ ok: false, json: async () => ({ message: 'secret provider detail' }) })
    const result = await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    expect(result).toEqual({ success: false, error: 'Resend delivery failed', statusCode: 502 })
    expect(supabase.rpc).toHaveBeenLastCalledWith('complete_notification_delivery', expect.objectContaining({ completion_error_code: 'RESEND_DISPATCH_ERROR' }))
  })

  it('escapes notification content before adding it to email HTML', async () => {
    supabase.maybeSingle.mockResolvedValue({ data: { ...notification, title: '<script>x</script>', message: 'A & B' }, error: null })
    await handleNotificationDelivery({ notification_id: 'notif-1' }, deps)
    const request = fetchFn.mock.calls[0][1]
    expect(request.body).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(request.body).toContain('A &amp; B')
    expect(request.body).not.toContain('<script>')
    expect(escapeHtml('"<>&\'')).toBe('&quot;&lt;&gt;&amp;&#039;')
  })
})
