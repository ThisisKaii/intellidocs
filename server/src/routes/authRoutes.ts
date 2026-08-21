import { Router } from 'express'
import { login, register, googleAuth, updateProfile } from '../controllers/authController'
import { authMiddleware } from '../middleware/authMiddleware'
import { authArcjet, signupArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { authBodySchema, googleAuthSchema, updateProfileSchema } from '../../schemas/authSchemas'

const router = Router()

router.post('/login', authArcjet, validateBody(authBodySchema), login)

router.post('/register', signupArcjet, validateBody(authBodySchema), register)

/** Called by the frontend after Google OAuth redirect to sync the session. */
router.post('/google', authArcjet, validateBody(googleAuthSchema), googleAuth)

/** Update the signed-in user's own profile (display name). */
router.patch('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile)

export default router
