import { Router } from 'express'
import {
  getPresets,
  setDocumentPreset,
  listBindings,
  createBinding,
  updateBinding,
  deleteBinding,
  tierCheck,
} from '../controllers/formattingController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import {
  createFormatBindingSchema,
  updateFormatBindingSchema,
  tierCheckSchema,
  setDocumentPresetSchema,
} from '../../schemas/formattingSchemas'

const router = Router()

// Tier 1 — presets
router.get('/presets', getPresets)
router.put(
  '/documents/:documentId/preset',
  validateBody(setDocumentPresetSchema),
  setDocumentPreset
)

// Tier 2 — custom bindings
router.get('/bindings', listBindings)
router.post('/bindings', validateBody(createFormatBindingSchema), createBinding)
router.put('/bindings/:id', validateBody(updateFormatBindingSchema), updateBinding)
router.delete('/bindings/:id', deleteBinding)

// Three-tier resolution (ML fallback is AI-facing → protected)
router.post('/tier-check', aiArcjet, validateBody(tierCheckSchema), tierCheck)

export default router
