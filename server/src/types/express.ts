import { Request } from 'express'

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string
    email: string
  }
}

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
