import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

interface AuthBody{
  email: string
  password: string
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as AuthBody

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const { data, error } = await supabase.auth.signUp({ email, password })

    if (error) {
      res.status(400).json({ error: error.message })
      return
    }


    res.status(201).json({
      user: data.user,
      message: 'User registered successfully'
    })
  } catch (error) {
    res.status(500).json({ error: "Registration failed."})
  }
}

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

    res.status(200).json({
      user: data.user,
      session: data.session,
      message: 'Login successful'
    })
  } catch (error) {
    res.status(500).json({ error: "Login failed."})
  }
}
