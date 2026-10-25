import { Router } from 'express'
import { exportAccountData, exportProfile, getEditorPreferences, importProfile, saveEditorPreferences } from '../controllers/profileController'
import { validateBody } from '../middleware/validate'
import { editorPreferencesSchema, profileImportSchema } from '../../schemas/profileSchemas'

const router = Router()

// .idocprofile personalization bundle export/import
router.get('/export', exportProfile)
router.post('/import', validateBody(profileImportSchema), importProfile)

// Editor preferences saved on the account, and a download of all the user's data
router.get('/editor-preferences', getEditorPreferences)
router.put('/editor-preferences', validateBody(editorPreferencesSchema), saveEditorPreferences)
router.get('/export-data', exportAccountData)

export default router