import { describe, expect, it, vi, beforeEach } from 'vitest'
import { handleNotificationDelivery, escapeHtml } from './notification_logic'

describe('send-notification Edge Function Core Logic', () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let mockSupabase: any
  let mockFetch: any
  let defaultDeps: any
  /* eslint-enable @typescript-eslint/no-explicit-any */

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      upsert: vi.fn().mockResolvedValue({ error: null }),
      auth: {
        admin: {
          getUserById: vi.fn()
        }
      }
    }

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'OK'
    })

    defaultDeps = {
      supabase: mockSupabase,
      resendApiKey: 'resend-key-123',
      resendFromEmail: 'OneHub <notifications@test.com>',
      webhookSecret: 'secret-key-456',
      requestSecret: 'secret-key-456',
      fetchFn: mockFetch
    }
  })

  it('rejects unauthenticated requests with 401', async () => {
    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      { ...defaultDeps, requestSecret: 'wrong-secret' }
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Unauthorized')
    expect(result.statusCode).toBe(401)
  })

  it('rejects invalid payload (missing notification_id) with 400', async () => {
    const result = await handleNotificationDelivery(
      {},
      defaultDeps
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Invalid payload')
    expect(result.statusCode).toBe(400)
  })

  it('enforces idempotency if notification delivery is already processed', async () => {
    // Mock that notification delivery status is 'sent'
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        status: 'sent',
        attempt_count: 1
      },
      error: null
    })

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      defaultDeps
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe('already_processed')
    expect(result.statusCode).toBe(200)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('handles missing notification record with 404', async () => {
    // Idempotency check returns null (not processed yet)
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })
    // Notification fetch returns null
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      defaultDeps
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Notification not found')
    expect(result.statusCode).toBe(404)
  })

  it('skips email delivery if notification is already read in-app', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // outbox check
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'notif-1',
        recipient_profile_id: 'user-123',
        title: 'Cash Advance Request',
        message: 'Concrete purchase',
        category: 'cash',
        is_read: true
      },
      error: null
    }) // notification record

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      defaultDeps
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe('skipped_read')
    expect(result.statusCode).toBe(200)
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 'notif-1',
        status: 'skipped',
        last_error_code: 'ALREADY_READ'
      }),
      expect.any(Object)
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('handles recipient email not found with 400', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // outbox check
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'notif-1',
        recipient_profile_id: 'user-123',
        title: 'Cash Advance Request',
        message: 'Concrete purchase',
        category: 'cash',
        is_read: false
      },
      error: null
    }) // notification record

    // Mock admin fetch failure
    mockSupabase.auth.admin.getUserById.mockResolvedValueOnce({
      data: null,
      error: new Error('User not found')
    })

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      defaultDeps
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Recipient email not found')
    expect(result.statusCode).toBe(400)
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 'notif-1',
        status: 'failed',
        last_error_code: 'EMAIL_NOT_FOUND'
      }),
      expect.any(Object)
    )
  })

  it('records delivery as skipped/disabled when Resend API key is placeholder or missing', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // outbox check
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'notif-1',
        recipient_profile_id: 'user-123',
        title: 'Cash Advance Request',
        message: 'Concrete purchase',
        category: 'cash',
        is_read: false
      },
      error: null
    }) // notification record

    mockSupabase.auth.admin.getUserById.mockResolvedValueOnce({
      data: { user: { email: 'user@test.invalid' } },
      error: null
    })

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      { ...defaultDeps, resendApiKey: 'placeholder' }
    )

    expect(result.success).toBe(true)
    expect(result.status).toBe('disabled')
    expect(result.statusCode).toBe(200)
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 'notif-1',
        status: 'skipped',
        last_error_code: 'EMAIL_DELIVERY_DISABLED'
      }),
      expect.any(Object)
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('dispatches to Resend successfully and updates outbox to sent', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // outbox check
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'notif-1',
        recipient_profile_id: 'user-123',
        title: 'Cash Advance Request',
        message: 'Concrete purchase',
        category: 'cash',
        is_read: false
      },
      error: null
    }) // notification record

    mockSupabase.auth.admin.getUserById.mockResolvedValueOnce({
      data: { user: { email: 'user@test.invalid' } },
      error: null
    })

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      defaultDeps
    )

    expect(result.success).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Concrete purchase')
      })
    )
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 'notif-1',
        status: 'sent'
      }),
      expect.any(Object)
    )
  })

  it('handles Resend API dispatch failure and marks outbox failed', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null, error: null }) // outbox
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: {
        id: 'notif-1',
        recipient_profile_id: 'user-123',
        title: 'Cash Advance',
        message: 'Concrete',
        category: 'cash',
        is_read: false
      },
      error: null
    })

    mockSupabase.auth.admin.getUserById.mockResolvedValueOnce({
      data: { user: { email: 'user@test.invalid' } },
      error: null
    })

    // Mock fetch error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => 'Resend Error'
    })

    const result = await handleNotificationDelivery(
      { notification_id: 'notif-1' },
      defaultDeps
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('Resend delivery failed')
    expect(result.statusCode).toBe(500)
    expect(mockSupabase.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        notification_id: 'notif-1',
        status: 'failed',
        last_error_code: 'RESEND_DISPATCH_ERROR'
      }),
      expect.any(Object)
    )
  })

  it('escapes HTML characters correctly', () => {
    const raw = '<script>alert("hello");</script> & some code'
    const escaped = escapeHtml(raw)
    expect(escaped).toBe('&lt;script&gt;alert(&quot;hello&quot;);&lt;/script&gt; &amp; some code')
  })
})
