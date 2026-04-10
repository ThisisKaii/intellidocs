import { Router } from 'express'
import * as documentController from '../controllers/documentController'

const router = Router()

router.get('/', documentController.getAllDocuments)
router.post('/', documentController.createDocument)
router.get('/:id', documentController.getDocument)
router.put('/:id', documentController.updateDocument)
router.delete('/:id', documentController.deleteDocument)

export default router