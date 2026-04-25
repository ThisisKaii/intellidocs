import arcjet, { detectBot, fixedWindow, shield } from '@arcjet/node'
import type { NextFunction, Request, RequestHandler, Response } from 'express'

type ArcjetMode = 'LIVE' | 'DRY_RUN'

interface ArcjetOptions {
  routeName: string
  rateLimit?: {
    max: number
    window: string
  }
  botProtection?: boolean
}

interface ArcjetDecisionReason {
  isRateLimit?: () => boolean
  isBot?: () => boolean
}

interface ArcjetDecisionLike {
  isDenied: () => boolean
  isErrored: () => boolean
  reason?: ArcjetDecisionReason
}

const arcjetKey = process.env.ARCJET_KEY
const defaultMode: ArcjetMode =
  process.env.NODE_ENV === 'production' ? 'LIVE' : 'DRY_RUN'

/** Log whether Arcjet is enabled when the middleware module loads. */
function logArcjetStartup(): void {
  if (!arcjetKey) {
    console.warn('[Arcjet] ARCJET_KEY is not set. Arcjet protection is disabled.')
    return
  }

  console.info(`[Arcjet] Protection enabled in ${defaultMode} mode.`)
}

/** Build a shared Arcjet denied-response payload. */
function handleDenied(decision: ArcjetDecisionLike): {
  status: number
  body: { error: string }
} {
  if (decision.reason?.isRateLimit?.()) {
    return {
      status: 429,
      body: { error: 'Too many requests' },
    }
  }

  if (decision.reason?.isBot?.()) {
    return {
      status: 403,
      body: { error: 'Bot traffic blocked' },
    }
  }

  return {
    status: 403,
    body: { error: 'Request blocked by security policy' },
  }
}

/** Log Arcjet decisions for local debugging and capstone demonstration. */
function logArcjetDecision(
  routeName: string,
  req: Request,
  decision: ArcjetDecisionLike
): void {
  const method = req.method
  const path = req.originalUrl || req.url

  if (decision.isErrored()) {
    console.warn(`[Arcjet] ${routeName} ${method} ${path} -> errored; request allowed`)
    return
  }

  if (decision.isDenied()) {
    const reason = decision.reason?.isRateLimit?.()
      ? 'rate_limit'
      : decision.reason?.isBot?.()
        ? 'bot'
        : 'policy'

    console.warn(`[Arcjet] ${routeName} ${method} ${path} -> denied (${reason})`)
    return
  }

  console.info(`[Arcjet] ${routeName} ${method} ${path} -> allowed`)
}

/** Create Arcjet middleware for a specific route group. */
export function createArcjetMiddleware(
  options: ArcjetOptions
): RequestHandler {
  if (!arcjetKey) {
    return (_req: Request, _res: Response, next: NextFunction): void => next()
  }

  const rules = [
    shield({ mode: defaultMode }),
    ...(options.rateLimit
      ? [
          fixedWindow({
            mode: defaultMode,
            max: options.rateLimit.max,
            window: options.rateLimit.window,
          }),
        ]
      : []),
    ...(options.botProtection
      ? [
          detectBot({
            mode: defaultMode,
            allow: [],
          }),
        ]
      : []),
  ]

  const client = arcjet({
    key: arcjetKey,
    rules,
  })

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decision = await client.protect(req)

      logArcjetDecision(options.routeName, req, decision)

      if (decision.isErrored()) {
        next()
        return
      }

      if (decision.isDenied()) {
        const denied = handleDenied(decision)
        res.status(denied.status).json(denied.body)
        return
      }

      next()
    } catch (error) {
      console.warn('[Arcjet] Middleware exception; request allowed', error)
      next()
    }
  }
}

/** Protect auth routes with rate limiting. */
export const authArcjet = createArcjetMiddleware({
  routeName: 'auth',
  rateLimit: { max: 10, window: '1m' },
})

/** Protect AI-facing routes with rate limiting and shield checks. */
export const aiArcjet = createArcjetMiddleware({
  routeName: 'ai',
  rateLimit: { max: 30, window: '1m' },
})

/** Protect signup routes with bot detection in addition to base checks. */
export const signupArcjet = createArcjetMiddleware({
  routeName: 'signup',
  rateLimit: { max: 5, window: '1m' },
  botProtection: true,
})

logArcjetStartup()
