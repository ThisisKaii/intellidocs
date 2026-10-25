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
router.get('/reports/timeseries', adminController.getReportTimeseries)
router.get('/documents', adminController.getAllDocuments)
router.delete('/documents/:documentId', adminController.deleteDocument)
router.get('/export-empirical', adminController.exportEmpiricalData)


export default router