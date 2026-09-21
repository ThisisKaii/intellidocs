import { Router } from 'express'
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware'
import { validateBody } from '../middleware/validate'
import { verifyApplicantSchema, updateRoleSchema } from '../../schemas/adminSchemas'
import * as adminController from '../controllers/adminController'

const router = Router()

// All routes require valid auth AND admin role
router.use(authMiddleware, requireAdmin)

router.get('/applicants/pending', adminController.getPendingApplicants)
router.post('/applicants/:userId/verify', validateBody(verifyApplicantSchema), adminController.verifyApplicant)
router.get('/users', adminController.getAllUsers)
router.patch('/users/:userId/role', validateBody(updateRoleSchema), adminController.updateUserRole)
router.get('/reports', adminController.getSystemReports)
router.get('/documents', adminController.getAllDocuments)
router.delete('/documents/:documentId', adminController.deleteDocument)
router.get('/export-empirical', adminController.exportEmpiricalData)

// Legacy professor-only endpoints (kept for backwards compatibility)
router.get('/professors/pending', adminController.getPendingProfessors)
router.post('/professors/:userId/verify', adminController.verifyProfessor)

export default router