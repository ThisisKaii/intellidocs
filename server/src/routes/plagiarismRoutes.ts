import { Router } from 'express'
import * as plagiarismController from '../controllers/plagiarismController'
import { validateBody } from '../middleware/validate'
import { requireApprovedProfessor } from '../middleware/authMiddleware'
import { runPlagiarismScanSchema, selfCheckSchema } from '../../schemas/plagiarismSchemas'

const router = Router()

router.post('/scans', requireApprovedProfessor, validateBody(runPlagiarismScanSchema), plagiarismController.runScan)
router.post('/self-check', validateBody(selfCheckSchema), plagiarismController.selfCheck)
router.post('/web-check', validateBody(selfCheckSchema), plagiarismController.webCheck)
router.post('/self-check/review', validateBody(selfCheckSchema), plagiarismController.selfCheckReview)
router.get('/scans/:id', plagiarismController.getScan)
router.get('/folders/:id/scans', requireApprovedProfessor, plagiarismController.listFolderScans)

export default router
