import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/**
 * True when the current Supabase session passed the password but the account
 * has 2FA switched on, so an authenticator code is still needed.
 */
export async function needsMfaChallenge(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) return false
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
}

/**
 * Check a 6-digit authenticator code against the account's verified factor and
 * return the upgraded (aal2) session.
 */
export async function verifyMfaCode(code: string): Promise<Session> {
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) throw new Error(listError.message)
  const factor = factors?.totp.find((candidate) => candidate.status === 'verified')
  if (!factor) throw new Error('No authenticator app is set up for this account.')

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (error) throw new Error(error.message.toLowerCase().includes('invalid') ? 'That code is not correct. Try the newest one.' : error.message)

  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) throw new Error('Sign-in did not complete. Please try again.')
  return sessionData.session
}
