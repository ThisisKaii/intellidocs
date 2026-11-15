import { Router } from 'express'
import multer from 'multer'
import {
  getPresets,
  setDocumentPreset,
  listUserPresets,
  createUserPreset,
  deleteUserPreset,
  createUserPresetFromFile,
  importUserPreset,
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
  importUserPresetSchema,
  updateFormatBindingSchema,
  tierCheckSchema,
  setDocumentPresetSchema,
  inferStructureSchema,
} from '../../schemas/formattingSchemas'

const router = Router()

/** A document to read a preset from: .docx or .pdf, kept in memory, 25 MB at most. */
const presetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error(`File type not allowed: ${file.mimetype}`))
  },
})

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
// A preset read from the user's own formatted document, and one shared as a .idocpreset file.
router.post('/user-presets/from-file', aiArcjet, presetUpload.single('file'), createUserPresetFromFile)
router.post('/user-presets/import', validateBody(importUserPresetSchema), importUserPreset)

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
