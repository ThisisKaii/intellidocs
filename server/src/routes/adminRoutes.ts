import { Router } from 'express'
import { authMiddleware, requireAdmin } from '../middleware/authMiddleware'
import * as adminController from '../controllers/adminController'

const router = Router()

// All routes require valid auth AND admin role
router.use(authMiddleware, requireAdmin)

router.get('/professors/pending', adminController.getPendingProfessors)
router.post('/professors/:userId/verify', adminController.verifyProfessor)
router.get('/users', adminController.getAllUsers)
router.patch('/users/:userId/role', adminController.updateUserRole)
router.get('/reports', adminController.getSystemReports)
router.delete('/documents/:documentId', adminController.deleteDocument)

export default router
