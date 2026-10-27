import { Request, Response, NextFunction } from 'express'

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * Let a request through only when it comes straight from this machine and the
 * server is not in production. Anything else gets the same 404 as an unknown
 * route. The socket address is used, not req.ip, because `trust proxy` is on and
 * a forwarded header must not be able to claim to be local.
 */
export function localOnly(req: Request, res: Response, next: NextFunction): void {
  const address = req.socket.remoteAddress ?? ''
  if (process.env.NODE_ENV === 'production' || !LOOPBACK_ADDRESSES.has(address)) {
    res.status(404).json({ error: 'Route not found' })
    return
  }
  next()
}
