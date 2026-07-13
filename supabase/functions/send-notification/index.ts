import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { handleNotificationDelivery } from './notification_logic.ts'

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') ?? ''
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET') ?? ''

    if (!supabaseUrl || !supabaseServiceKey || !webhookSecret) {
      return new Response(JSON.stringify({ success: false, error: 'Notification delivery is not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      })
    }
    if (!resendApiKey || !resendFromEmail) {
      return new Response(JSON.stringify({ success: false, error: 'Email provider is not configured' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      })
    }

    const body = await req.json().catch(() => ({}))
    const result = await handleNotificationDelivery(body, {
      supabase: createClient(supabaseUrl, supabaseServiceKey),
      resendApiKey,
      resendFromEmail,
      webhookSecret,
      requestSecret: req.headers.get('X-Webhook-Secret'),
      fetchFn: fetch
    })

    return new Response(JSON.stringify({ success: result.success, error: result.error, status: result.status }), {
      headers: { 'Content-Type': 'application/json' },
      status: result.statusCode
    })
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
