import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | undefined

function readPublicConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

  if (!url || !anonKey) {
    throw new Error('OneHub database configuration is unavailable.')
  }

  const parsedUrl = new URL(url)
  const localDevelopment = ['localhost', '127.0.0.1'].includes(parsedUrl.hostname)
  if (parsedUrl.protocol !== 'https:' && !(localDevelopment && parsedUrl.protocol === 'http:')) {
    throw new Error('OneHub database configuration is invalid.')
  }

  return { url: parsedUrl.toString(), anonKey }
}

export function getSupabaseClient() {
  if (!browserClient) {
    const { url, anonKey } = readPublicConfig()
    browserClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  }

  return browserClient
}
