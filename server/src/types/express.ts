import { Request } from 'express'

// Extend Express Request to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
      }
    }
  }
}
