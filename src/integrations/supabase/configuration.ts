export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
export const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

function configurationError() {
  if (!supabaseUrl || !supabaseKey) return 'Add your Supabase project URL and publishable key to .env.local, then restart the application.'
  try {
    const parsed = new URL(supabaseUrl)
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
  } catch {
    return 'VITE_SUPABASE_URL must be a valid Supabase project URL.'
  }
  if (supabaseKey.startsWith('sb_secret_')) return 'Use a Supabase publishable key, not a secret key.'
  return null
}

export const configError = configurationError()
