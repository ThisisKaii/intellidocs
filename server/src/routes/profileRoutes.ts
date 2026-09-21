import { Router } from 'express'
import { exportProfile, importProfile } from '../controllers/profileController'
import { validateBody } from '../middleware/validate'
import { profileImportSchema } from '../../schemas/profileSchemas'

const router = Router()

// .idocprofile personalization bundle export/import
router.get('/export', exportProfile)
router.post('/import', validateBody(profileImportSchema), importProfile)

export default router