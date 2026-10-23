import { Router } from 'express'
import {
  getPresets,
  setDocumentPreset,
  listUserPresets,
  createUserPreset,
  deleteUserPreset,
  listBindings,
  createBinding,
  updateBinding,
  deleteBinding,
  tierCheck,
  inferStructure,
} from '../controllers/formattingController'
import { aiArcjet } from '../middleware/arcjet'
import { validateBody } from '../middleware/validate'
import {
  createFormatBindingSchema,
  createUserPresetSchema,
  updateFormatBindingSchema,
  tierCheckSchema,
  setDocumentPresetSchema,
  inferStructureSchema,
} from '../../schemas/formattingSchemas'

const router = Router()

// Tier 1 — presets
router.get('/presets', getPresets)
router.put(
  '/documents/:documentId/preset',
  validateBody(setDocumentPresetSchema),
  setDocumentPreset
)

// Tier 1b — user-forked blueprints (V2 auto-versioning)
router.get('/user-presets', listUserPresets)
router.post('/user-presets', validateBody(createUserPresetSchema), createUserPreset)
router.delete('/user-presets/:id', deleteUserPreset)

// Tier 2 — custom bindings
router.get('/bindings', listBindings)
router.post('/bindings', validateBody(createFormatBindingSchema), createBinding)
router.put('/bindings/:id', validateBody(updateFormatBindingSchema), updateBinding)
router.delete('/bindings/:id', deleteBinding)

// Document structure inference — pure classification, no AI provider involved
router.post('/infer-structure', validateBody(inferStructureSchema), inferStructure)

// Three-tier resolution (ML fallback is AI-facing → protected)
router.post('/tier-check', aiArcjet, validateBody(tierCheckSchema), tierCheck)

export default router
