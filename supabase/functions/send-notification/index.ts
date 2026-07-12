import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  try {
    const { record } = await req.json()
    if (!record || !record.recipient_profile_id) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid payload' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 1. Fetch recipient's email address
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(record.recipient_profile_id)
    if (userError || !userData?.user?.email) {
      console.log(`Failed to fetch email for user profile ${record.recipient_profile_id}:`, userError)
      return new Response(JSON.stringify({ success: false, error: 'Recipient email not found' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 400
      })
    }

    const email = userData.user.email
    const title = record.title
    const message = record.message

    console.log(`Sending email notification to ${email}: ${title} - ${message}`)

    // 2. Send email via Resend API if API Key is configured
    if (resendApiKey && resendApiKey !== 'placeholder') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`
        },
        body: JSON.stringify({
          from: 'OneHub Notifications <notifications@egypro-onehub.com>',
          to: [email],
          subject: title,
          html: `<div style="font-family: sans-serif; padding: 20px; line-height: 1.5;">
            <h2 style="color: #0d9488;">${title}</h2>
            <p>${message}</p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
            <small style="color: #6b7280;">This is an automated notification from Egypro OneHub 2.0. Please do not reply.</small>
          </div>`
        })
      })

      if (!response.ok) {
        const errText = await response.text()
        console.error('Failed to dispatch email via Resend:', errText)
        return new Response(JSON.stringify({ success: false, error: errText }), {
          headers: { 'Content-Type': 'application/json' },
          status: 500
        })
      }
    } else {
      console.log('Resend API key not configured. Logging notification locally only.')
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Edge function error:', err)
    return new Response(JSON.stringify({ success: false, error: errorMsg }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    })
  }
})
