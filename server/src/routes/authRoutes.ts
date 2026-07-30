import { Router } from 'express'
import { login, register, googleAuth } from '../controllers/authController'
import { authArcjet, signupArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { authBodySchema, googleAuthSchema } from '../../schemas/authSchemas'

const router = Router()

router.post('/login', authArcjet, validateBody(authBodySchema), login)

router.post('/register', signupArcjet, validateBody(authBodySchema), register)

/** Called by the frontend after Google OAuth redirect to sync the session. */
router.post('/google', authArcjet, validateBody(googleAuthSchema), googleAuth)

export default router
