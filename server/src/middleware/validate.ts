import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodError, ZodSchema } from 'zod'

/** Validate a request body against a Zod schema before the controller runs. */
export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body)
      next()
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          error: error.issues[0]?.message || 'Invalid request body',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        })
        return
      }

      res.status(500).json({ error: 'Validation failed' })
    }
  }
}