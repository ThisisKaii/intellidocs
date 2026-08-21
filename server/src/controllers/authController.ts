import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { updateOwnProfile } from '../models/userModel'
import { AuthenticatedRequest } from '../types/express'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

interface AuthBody {
  email: string
  password: string
  role?: 'student' | 'professor'
}

interface GoogleAuthBody {
  accessToken: string
}

/** Register a new user with email, password, and optional role. */
export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, role = 'student' } = req.body as AuthBody

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    // If a role was specified, upsert the user profile immediately
    if (data.user && role) {
      // Fetch the role_id for the selected role name
      const { data: roleRow } = await supabase
        .from('roles')
        .select('role_id')
        .eq('role_name', role)
        .single()

      if (roleRow) {
        await supabase.from('user_profiles').upsert({
          user_id: data.user.id,
          role_id: roleRow.role_id,
          verification_status: role === 'professor' ? 'pending' : 'approved',
        })
      }
    }

    res.status(201).json({
      user: data.user,
      message: 'User registered successfully',
    })
  } catch {
    res.status(500).json({ error: 'Registration failed.' })
  }
}

/** Login with email and password. */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as AuthBody

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }

    // Fetch the user profile to get role and verification status
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('verification_status, roles(role_name)')
      .eq('user_id', data.user.id)
      .single()

    res.status(200).json({
      user: {
        ...data.user,
        role: (profile?.roles as { role_name?: string } | null)?.role_name ?? 'student',
        verificationStatus: profile?.verification_status ?? 'approved',
        displayName: data.user.user_metadata?.display_name ?? null,
      },
      session: data.session,
      message: 'Login successful',
    })
  } catch {
    res.status(500).json({ error: 'Login failed.' })
  }
}

/**
 * Called after Google OAuth redirect completes.
 * Receives the Supabase access token, verifies it, upserts the user profile,
 * and returns role + verificationStatus so the frontend can store them.
 */
export async function googleAuth(req: Request, res: Response): Promise<void> {
  try {
    const { accessToken } = req.body as GoogleAuthBody

    if (!accessToken) {
      res.status(400).json({ error: 'Access token is required' })
      return
    }

    // Verify the token and get the user from Supabase
    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !userData.user) {
      res.status(401).json({ error: 'Invalid or expired access token' })
      return
    }

    const user = userData.user

    // Fetch or create student role (Google users default to student)
    const { data: studentRole } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', 'student')
      .single()

    // Upsert user profile — create if first time, no-op if already exists
    if (studentRole) {
      await supabase.from('user_profiles').upsert(
        {
          user_id: user.id,
          role_id: studentRole.role_id,
          verification_status: 'approved',
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      )
    }

    // Fetch the final profile (may have been created above or already existed)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('verification_status, roles(role_name)')
      .eq('user_id', user.id)
      .single()

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email ?? '',
        displayName:
          user.user_metadata?.display_name ?? user.user_metadata?.full_name ?? null,
      },
      role: (profile?.roles as { role_name?: string } | null)?.role_name ?? 'student',
      verificationStatus: profile?.verification_status ?? 'approved',
      message: 'Google authentication successful',
    })
  } catch {
    res.status(500).json({ error: 'Google authentication failed.' })
  }
}

/** Update the signed-in user's own profile fields (display name). */
export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: '401 Unauthorized: Session required' })
      return
    }

    const { display_name } = req.body as { display_name?: string }
    if (typeof display_name !== 'string' || display_name.trim().length === 0) {
      res.status(400).json({ error: 'display_name is required' })
      return
    }

    const saved = await updateOwnProfile(userId, display_name.trim())
    if (saved === null) {
      res.status(500).json({ error: 'Failed to update profile' })
      return
    }

    res.status(200).json({
      user: {
        id: userId,
        email: req.user?.email ?? '',
        displayName: saved,
      },
      message: 'Profile updated successfully',
    })
  } catch {
    res.status(500).json({ error: 'Failed to update profile' })
  }
}
