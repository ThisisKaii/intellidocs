import { createClient } from '@supabase/supabase-js'

/**
 * Frontend-only Supabase client.
 * Used exclusively for OAuth flows (signInWithOAuth, getSession).
 * All data queries go through Express, never call Supabase directly for data.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
