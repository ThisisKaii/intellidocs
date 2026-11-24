import { Request, Response, NextFunction } from 'express'
import { createClient, isAuthRetryableFetchError, type User } from '@supabase/supabase-js'
import { isMissingSecondFactor } from '../utils/tokenClaims'
import type { RoleName } from '../types/index'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

/** The role join on a user_profiles row: one object, or an array depending on how the relation is inferred. */
interface ProfileRoleJoin {
  roles?: { role_name?: RoleName | null } | Array<{ role_name?: RoleName | null }> | null
}

/** The role name a profile row joins to, or undefined when it has none. */
function profileRoleName(profile: ProfileRoleJoin): RoleName | undefined {
  const roles = Array.isArray(profile.roles) ? profile.roles[0] : profile.roles
  return roles?.role_name ?? undefined
}

/** Outcome of checking a Supabase access token. */
export type AccessTokenCheck =
  | { ok: true; user: { id: string; email: string } }
  | { ok: false; error: string; code?: 'mfa_required' | 'auth_unavailable' }

const AUTH_UNAVAILABLE: AccessTokenCheck = {
  ok: false,
  error: '503 Service Unavailable: Could not verify your session right now. Try again.',
  code: 'auth_unavailable',
}

/** Wait before the one retry of a session check that could not reach Supabase. */
const AUTH_RETRY_DELAY_MS = 400

/** True when the check never got an answer (network, timeout, Supabase 5xx), not a refusal. */
function unreachable(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true
  const status = (error as { status?: unknown } | null)?.status
  return typeof status !== 'number' || status === 0 || status >= 500
}

async function getUserOnce(token: string): Promise<{ user: User | null; unreachable: boolean }> {
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error) return { user: null, unreachable: unreachable(error) }
    return { user: data.user, unreachable: false }
  } catch {
    return { user: null, unreachable: true } // fetch itself failed
  }
}

/**
 * Verify a Supabase access token, including the 2FA rule. Shared by the HTTP middleware and the
 * collaboration WebSocket, which cannot send headers and passes the token another way. A check
 * that cannot reach Supabase is retried once and then reported as `auth_unavailable` (503), never
 * as an invalid session: signing the user out over a network blip loses their place.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenCheck> {
  let result = await getUserOnce(token)
  if (result.unreachable) {
    await new Promise((resolve) => setTimeout(resolve, AUTH_RETRY_DELAY_MS))
    result = await getUserOnce(token)
  }
  if (result.unreachable) return AUTH_UNAVAILABLE
  const user = result.user
  if (!user) return { ok: false, error: '401 Unauthorized: Invalid or expired session token' }
  // An account with 2FA on must present a token that passed the code step.
  if (isMissingSecondFactor(user, token)) {
    return { ok: false, error: '401 Unauthorized: Two-factor code required', code: 'mfa_required' }
  }
  return { ok: true, user: { id: user.id, email: user.email ?? '' } }
}

/** Basic authentication middleware: verifies Supabase Bearer JWT token. */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      res.status(401).json({ error: '401 Unauthorized: No authorization header provided' })
      return
    }

    const check = await verifyAccessToken(authHeader.replace('Bearer ', ''))
    if (!check.ok) {
      res.status(check.code === 'auth_unavailable' ? 503 : 401).json(check.code ? { error: check.error, code: check.code } : { error: check.error })
      return
    }

    req.user = check.user
    next()
  } catch (error) {
    console.error('Auth middleware exception:', error)
    res.status(500).json({ error: 'Auth middleware failed' })
  }
}

/** Admin-only middleware: verifies the user has the 'admin' role. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: '401 Unauthorized: Session required' })
      return
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role_id, roles(role_name)')
      .eq('user_id', userId)
      .single()

    if (error || !profile) {
      res.status(403).json({ error: '403 Forbidden: User profile not found' })
      return
    }

    const roleName = profileRoleName(profile as ProfileRoleJoin)
    if (roleName !== 'admin') {
      res.status(403).json({ error: '403 Forbidden: Administrator access required' })
      return
    }

    next()
  } catch (error) {
    console.error('Admin middleware exception:', error)
    res.status(500).json({ error: 'Admin check failed' })
  }
}

/** Professor middleware: verifies the user has role 'professor' AND verification_status === 'approved'. */
export async function requireApprovedProfessor(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: '401 Unauthorized: Session required' })
      return
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('verification_status, roles(role_name)')
      .eq('user_id', userId)
      .single()

    if (error || !profile) {
      res.status(403).json({ error: '403 Forbidden: User profile not found' })
      return
    }

    const roleName = profileRoleName(profile as ProfileRoleJoin)
    const status = profile.verification_status

    // Administrators manage users and view data; they do not teach, review or scan (professors only).
    if (roleName !== 'professor') {
      res.status(403).json({ error: '403 Forbidden: Professor role required' })
      return
    }

    if (status !== 'approved') {
      res.status(403).json({
        error: `403 Forbidden: Professor application status is '${status}'. Administrator approval required.`,
      })
      return
    }

    next()
  } catch (error) {
    console.error('Professor middleware exception:', error)
    res.status(500).json({ error: 'Professor verification check failed' })
  }
}

/** Creating a class folder needs an approved professor; personal folders are open to everyone. */
export async function requireProfessorForClassFolder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.body?.folderType !== 'class') {
    next()
    return
  }
  await requireApprovedProfessor(req, res, next)
}
