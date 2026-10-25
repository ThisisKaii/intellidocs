import request from 'supertest'
import type { NextFunction, Request, Response } from 'express'

/**
 * Section 7 acceptance tests: per-user Google Drive OAuth isolation.
 *
 * These assert the routing, scoping and state-signing that the application
 * controls. The real Google consent screen is verified manually because it needs
 * live credentials.
 */

// authMiddleware is replaced so the test controls exactly which user id the
// controller sees. The real middleware is exercised by the auth suite.
jest.mock('../../middleware/authMiddleware', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.headers['x-test-user']
    if (typeof userId !== 'string') {
      // Mirror the real middleware, which rejects rather than throwing.
      res.status(401).json({ error: '401 Unauthorized: No session' })
      return
    }
    req.user = { id: userId, email: `${userId}@example.test` }
    next()
  },
  requireAdmin: (_req: Request, _res: Response, next: NextFunction): void => next(),
  requireApprovedProfessor: (_req: Request, _res: Response, next: NextFunction): void => next(),
  requireProfessorForClassFolder: (_req: Request, _res: Response, next: NextFunction): void => next(),
}))

jest.mock('../../models/driveModel', () => ({
  upsertGoogleTokens: jest.fn().mockResolvedValue(undefined),
  getGoogleTokens: jest.fn(),
  deleteGoogleTokens: jest.fn().mockResolvedValue(undefined),
  linkProviderTokenIfAbsent: jest.fn().mockResolvedValue({
    linked: true,
    reason: 'linked',
  }),
  getDriveClient: jest.fn(),
}))

jest.mock('../../middleware/arcjet', () => ({
  authArcjet: (_req: Request, _res: Response, next: NextFunction): void => next(),
  signupArcjet: (_req: Request, _res: Response, next: NextFunction): void => next(),
  aiArcjet: (_req: Request, _res: Response, next: NextFunction): void => next(),
  predictionsArcjet: (_req: Request, _res: Response, next: NextFunction): void => next(),
}))

import app from '../../index'
import * as driveController from '../../controllers/driveController'
import * as driveModel from '../../models/driveModel'

const mockedGet = driveModel.getGoogleTokens as jest.MockedFunction<
  typeof driveModel.getGoogleTokens
>
const mockedLink = driveModel.linkProviderTokenIfAbsent as jest.MockedFunction<
  typeof driveModel.linkProviderTokenIfAbsent
>
const mockedDelete = driveModel.deleteGoogleTokens as jest.MockedFunction<
  typeof driveModel.deleteGoogleTokens
>

/**
 * A minimal Express app carrying only the drive routes, so the mocked
 * authMiddleware is the one that runs. The full app is not used because its
 * error handler is already bound to a different middleware instance.
 */
const testApp = app

/** Send a request as a specific user. */
function asUser(
  method: 'get' | 'post' | 'delete',
  path: string,
  userId: string
): request.Test {
  return request(testApp)[method](path).set('x-test-user', userId)
}

describe('Section 7: per-user Google Drive OAuth isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedLink.mockResolvedValue({ linked: true, reason: 'linked' })
    mockedDelete.mockResolvedValue(undefined)
  })

  describe('OAuth state binding', () => {
    it('round-trips the user id through a signed state', () => {
      const state = driveController.__testing.signOAuthState('user-a')
      expect(driveController.__testing.verifyOAuthState(state)).toBe('user-a')
    })

    it('rejects a state verified under a different secret', () => {
      const state = driveController.__testing.signOAuthState('user-a')
      // Simulates an attacker trying to replay a state they minted themselves.
      expect(driveController.__testing.verifyOAuthState(state, 'attacker-secret')).toBeNull()
    })

    it('rejects a tampered state payload', () => {
      const state = driveController.__testing.signOAuthState('user-a')
      const tampered = state.slice(0, -4) + 'AAAA'
      expect(driveController.__testing.verifyOAuthState(tampered)).toBeNull()
    })

    it('rejects a state older than the 10 minute TTL', () => {
      const state = driveController.__testing.issueAt('user-a', Date.now() - 11 * 60 * 1000)
      expect(driveController.__testing.verifyOAuthState(state)).toBeNull()
    })

    it('rejects a state whose signature does not match its payload', () => {
      // A state legitimately signed for user-b, then rewritten to claim user-a.
      // The signature is copied verbatim, so verification must fail.
      const state = driveController.__testing.signOAuthState('user-b')
      const decoded = Buffer.from(state, 'base64url').toString('utf-8')
      const [, issuedAt, signature] = decoded.split('.')
      const forged = Buffer.from(`user-a.${issuedAt}.${signature}`, 'utf-8').toString('base64url')
      expect(driveController.__testing.verifyOAuthState(forged)).toBeNull()
    })
  })

  describe('status is scoped to the caller', () => {
    it('reports disconnected when the caller has no tokens', async () => {
      mockedGet.mockResolvedValue(null)
      const res = await asUser('get', '/drive/status', 'user-a')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ connected: false })
      expect(mockedGet).toHaveBeenCalledWith('user-a')
    })

    it('queries by the caller id, never an ambient user', async () => {
      mockedGet.mockResolvedValue({ user_id: 'user-a' } as never)
      const res = await asUser('get', '/drive/status', 'user-a')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ connected: true })
      expect(mockedGet).toHaveBeenCalledWith('user-a')
    })
  })

  describe('provider token linking', () => {
    it('stores the token against the authenticated user id', async () => {
      const res = await asUser('post', '/drive/link-provider', 'user-a').send({
        providerToken: 'ya29.a-provider-token',
        providerRefreshToken: '1//refresh',
      })
      expect(res.status).toBe(200)
      expect(mockedLink).toHaveBeenCalledWith('user-a', 'ya29.a-provider-token', '1//refresh', 0)
    })

    it('never trusts a user id supplied in the body', async () => {
      await asUser('post', '/drive/link-provider', 'user-a').send({
        providerToken: 'ya29.token',
        providerRefreshToken: '1//refresh',
        // A forged body field must be ignored outright.
        userId: 'user-victim',
      })
      expect(mockedLink).toHaveBeenCalledWith('user-a', 'ya29.token', '1//refresh', 0)
      expect(mockedLink.mock.calls[0][0]).not.toBe('user-victim')
    })

    it('rejects a link request with no provider token', async () => {
      const res = await asUser('post', '/drive/link-provider', 'user-a').send({
        providerRefreshToken: '1//refresh',
      })
      expect(res.status).toBe(400)
      expect(mockedLink).not.toHaveBeenCalled()
    })

    it('refuses to store a token with no refresh token', async () => {
      const res = await asUser('post', '/drive/link-provider', 'user-a').send({
        providerToken: 'ya29.token',
      })
      // Storing an access token with no refresh token would leave the account
      // connected only until the token expired, then fail opaquely.
      expect(res.status).toBe(400)
      expect(mockedLink).not.toHaveBeenCalled()
    })

    it('rejects an unauthenticated link attempt', async () => {
      const res = await request(testApp)
        .post('/drive/link-provider')
        .send({ providerToken: 'ya29.token', providerRefreshToken: '1//refresh' })
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(mockedLink).not.toHaveBeenCalled()
    })
  })

  describe('disconnect removes only the caller credentials', () => {
    it('deletes tokens for the authenticated user only', async () => {
      await asUser('delete', '/drive/disconnect', 'user-a')
      expect(mockedDelete).toHaveBeenCalledWith('user-a')
      expect(mockedDelete).toHaveBeenCalledTimes(1)
    })

    it('rejects an unauthenticated disconnect', async () => {
      const res = await request(testApp).delete('/drive/disconnect')
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(mockedDelete).not.toHaveBeenCalled()
    })
  })
})

