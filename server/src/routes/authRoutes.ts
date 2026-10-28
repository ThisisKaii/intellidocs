import { Router } from 'express'
import { login, register, googleAuth, updateProfile, applyProfessor, applyStudent, getApplicationStatus, changePassword, deleteAccount, getUserStorage, getMe } from '../controllers/authController'
import { uploadAvatar, deleteAvatar } from '../controllers/avatarController'
import { avatarUpload } from '../middleware/avatarUpload'
import { authMiddleware } from '../middleware/authMiddleware'
import { authArcjet, signupArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import { authBodySchema, googleAuthSchema, updateProfileSchema, applyProfessorSchema, applyStudentSchema, changePasswordSchema, deleteAccountSchema } from '../../schemas/authSchemas'

const router = Router()

router.post('/login', authArcjet, validateBody(authBodySchema), login)

router.post('/register', signupArcjet, validateBody(authBodySchema), register)

/** Called by the frontend after Google OAuth redirect to sync the session. */
router.post('/google', authArcjet, validateBody(googleAuthSchema), googleAuth)

/** Update the signed-in user's own profile (display name). */
router.patch('/profile', authMiddleware, validateBody(updateProfileSchema), updateProfile)

/** Upload or remove the signed-in user's profile photo (PNG/JPG/WebP, up to 2 MB). */
router.post('/profile/avatar', authMiddleware, avatarUpload, uploadAvatar)
router.delete('/profile/avatar', authMiddleware, deleteAvatar)

/** Return the signed-in user's storage usage vs their account quota. */
router.get('/storage', authMiddleware, getUserStorage)

/**
 * Return the signed-in user's current role and verification status, read fresh
 * so an administrator's approval is reflected without a new sign-in.
 */
router.get('/me', authMiddleware, getMe)

/** Submit a faculty verification application (student → pending professor). */
router.get('/application-status', authMiddleware, getApplicationStatus)
router.post('/password', authMiddleware, validateBody(changePasswordSchema), changePassword)
router.delete('/account', authMiddleware, validateBody(deleteAccountSchema), deleteAccount)
router.post('/apply-professor', authMiddleware, validateBody(applyProfessorSchema), applyProfessor)

/** Submit a student status application (regular user → pending student). */
router.post('/apply-student', authMiddleware, validateBody(applyStudentSchema), applyStudent)

export default router
