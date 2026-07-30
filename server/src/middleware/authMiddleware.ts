import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

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

    const token = authHeader.replace('Bearer ', '')
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      res.status(401).json({ error: '401 Unauthorized: Invalid or expired session token' })
      return
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
    }
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

    const roleName = (profile as any).roles?.role_name
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

    const roleName = (profile as any).roles?.role_name
    const status = profile.verification_status

    if (roleName !== 'professor' && roleName !== 'admin') {
      res.status(403).json({ error: '403 Forbidden: Professor role required' })
      return
    }

    if (roleName === 'professor' && status !== 'approved') {
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
