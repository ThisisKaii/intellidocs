import { Router } from 'express'
import { login, register, googleAuth, updateProfile, applyProfessor } from '../controllers/authController'
import { authMiddleware } from '../middleware/authMiddleware'
import { authArcjet, signupArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { authBodySchema, googleAuthSchema, updateProfileSchema, applyProfessorSchema } from '../../schemas/authSchemas'

const router = Router()

router.post('/login', authArcjet, validateBody(authBodySchema), login)

router.post('/register', signupArcjet, validateBody(authBodySchema), register)

/** Called by the frontend after Google OAuth redirect to sync the session. */
router.post('/google', authArcjet, validateBody(googleAuthSchema), googleAuth)

/** Update the signed-in user's own profile (display name). */
router.patch('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile)

/** Submit a faculty verification application (student → pending professor). */
router.post('/apply-professor', authMiddleware, validateBody(applyProfessorSchema), applyProfessor)

export default router
