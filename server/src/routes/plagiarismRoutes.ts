import { Router } from 'express'
import * as plagiarismController from '../controllers/plagiarismController'
import { validateBody } from '../middleware/validate'
import { requireApprovedProfessor } from '../middleware/authMiddleware'
import { runPlagiarismScanSchema, selfCheckSchema, webCheckSchema } from '../../schemas/plagiarismSchemas'

const router = Router()

router.post('/scans', requireApprovedProfessor, validateBody(runPlagiarismScanSchema), plagiarismController.runScan)
router.post('/self-check', validateBody(selfCheckSchema), plagiarismController.selfCheck)
router.post('/web-check', validateBody(webCheckSchema), plagiarismController.webCheck)
router.post('/web-check/start', validateBody(webCheckSchema), plagiarismController.startWebCheck)
router.get('/web-check/document/:documentId', plagiarismController.getLatestDocumentWebCheck)
router.get('/web-check/:jobId', plagiarismController.getWebCheckJob)
router.post('/self-check/review', validateBody(selfCheckSchema), plagiarismController.selfCheckReview)
router.get('/scans/:id', plagiarismController.getScan)
router.get('/folders/:id/scans', requireApprovedProfessor, plagiarismController.listFolderScans)

export default router
