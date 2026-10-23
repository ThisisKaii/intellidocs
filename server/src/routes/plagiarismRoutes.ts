import { Router } from 'express'
import * as plagiarismController from '../controllers/plagiarismController'
import { validateBody } from '../middleware/validate'
import { runPlagiarismScanSchema, selfCheckSchema } from '../../schemas/plagiarismSchemas'

const router = Router()

router.post('/scans', validateBody(runPlagiarismScanSchema), plagiarismController.runScan)
router.post('/self-check', validateBody(selfCheckSchema), plagiarismController.selfCheck)
router.get('/scans/:id', plagiarismController.getScan)
router.get('/folders/:id/scans', plagiarismController.listFolderScans)

export default router
