import type { UserIdentity } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** The Google identity linked to the signed-in Supabase user. */
export interface LinkedGoogleIdentity {
  /** The identity object Supabase needs back for `unlinkIdentity`. */
  identity: UserIdentity
  email: string | null
  /** False when Google is the account's only sign-in method; Supabase won't remove that one. */
  canUnlink: boolean
}

/** Read the linked Google identity (if any) from the current Supabase user. */
export async function getLinkedGoogleIdentity(): Promise<LinkedGoogleIdentity | null> {
  const { data } = await supabase.auth.getUser()
  const identities = data?.user?.identities ?? []
  const google = identities.find((id) => id.provider?.toLowerCase() === 'google')
  if (!google) return null
  const email = typeof google.identity_data?.email === 'string' ? google.identity_data.email : null
  return { identity: google, email, canUnlink: identities.length > 1 }
}
