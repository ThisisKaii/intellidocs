import { Router } from 'express'
import * as documentController from '../controllers/documentController'
import { validateBody } from '../middleware/validate'
import {
  createDocumentSchema,
  updateDocumentSchema,
} from '../../schemas/documentSchemas'

const router = Router()

router.get('/', documentController.getAllDocuments)
router.post('/', validateBody(createDocumentSchema), documentController.createDocument)
router.get('/:id', documentController.getDocument)
router.put('/:id', validateBody(updateDocumentSchema), documentController.updateDocument)
router.delete('/:id', documentController.deleteDocument)

export default router