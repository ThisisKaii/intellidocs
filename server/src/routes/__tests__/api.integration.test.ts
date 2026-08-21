import request from 'supertest'

jest.mock('../../middleware/arcjet', () => ({
  authArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
  signupArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
  aiArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
  adminArcjet: (_req: unknown, _res: unknown, next: () => void) => next(),
}))

import app from '../../index'

describe('API Integration Tests', () => {
  describe('GET /health', () => {
    it('returns 200 with OK status', async () => {
      const response = await request(app).get('/health')
      expect(response.status).toBe(200)
      expect(response.body.status).toBe('OK')
    })
  })

  describe('GET /', () => {
    it('returns 200 welcome message', async () => {
      const response = await request(app).get('/')
      expect(response.status).toBe(200)
      expect(response.body.message).toContain('IntelliDocs API')
    })
  })

  describe('Auth routes validation', () => {
    it('POST /auth/login fails with 400 when body is empty', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({})
      expect(response.status).toBe(400)
    })

    it('POST /auth/register fails with 400 when body is empty', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({})
      expect(response.status).toBe(400)
    })
  })

  describe('Protected routes without JWT authorization token', () => {
    it('GET /documents rejects unauthenticated request with 401', async () => {
      const response = await request(app).get('/documents')
      expect(response.status).toBe(401)
    })

    it('POST /ai/feedback rejects unauthenticated request with 401', async () => {
      const response = await request(app)
        .post('/ai/feedback')
        .send({
          predictedFormat: 'heading1',
          accepted: true,
        })
      expect(response.status).toBe(401)
    })

    it('POST /predictions/predict rejects unauthenticated request with 401', async () => {
      const response = await request(app)
        .post('/predictions/predict')
        .send({ text: 'Sample text' })
      expect(response.status).toBe(401)
    })
  })

  describe('404 catch-all route', () => {
    it('returns 404 for unknown endpoints', async () => {
      const response = await request(app).get('/non-existent-route-xyz')
      expect(response.status).toBe(404)
      expect(response.body.error).toBe('Route not found')
    })
  })
})
