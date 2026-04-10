import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'


const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization
    if(!authHeader) {
      res.status(401).json({ error: 'No authorization header' })
      return
    }

    const token = authHeader.replace('Bearer ', '')
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      res.status(401).json({error: "Invalid or expired token"})
      return
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
    }
    next()
  } catch (error) {
    res.status(500).json({error: 'Auth middleware failed'})
  }
}
