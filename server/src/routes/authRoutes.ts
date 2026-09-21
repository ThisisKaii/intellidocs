import { Router } from 'express'
import { login, register, googleAuth, updateProfile, applyProfessor, applyStudent, getUserStorage } from '../controllers/authController'
import { authMiddleware } from '../middleware/authMiddleware'
import { authArcjet, signupArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { authBodySchema, googleAuthSchema, updateProfileSchema, applyProfessorSchema, applyStudentSchema } from '../../schemas/authSchemas'

const router = Router()

router.post('/login', authArcjet, validateBody(authBodySchema), login)

router.post('/register', signupArcjet, validateBody(authBodySchema), register)

/** Called by the frontend after Google OAuth redirect to sync the session. */
router.post('/google', authArcjet, validateBody(googleAuthSchema), googleAuth)

/** Update the signed-in user's own profile (display name). */
router.patch('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile)

/** Return the signed-in user's storage usage vs their account quota. */
router.get('/storage', authMiddleware, getUserStorage)

/** Submit a faculty verification application (student → pending professor). */
router.post('/apply-professor', authMiddleware, validateBody(applyProfessorSchema), applyProfessor)

/** Submit a student status application (regular user → pending student). */
router.post('/apply-student', authMiddleware, validateBody(applyStudentSchema), applyStudent)

export default router
