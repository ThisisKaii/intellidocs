import { Router } from 'express'
import * as driveController from '../controllers/driveController'

const router = Router()

/** Generate Google OAuth2 consent URL. */
router.get('/auth-url', driveController.getAuthUrl)

/** OAuth2 callback — exchanges code for tokens. */
router.get('/callback', driveController.handleCallback)

/** Check whether Google Drive is connected. */
router.get('/status', driveController.getConnectionStatus)

/** Disconnect Google Drive. */
router.delete('/disconnect', driveController.disconnect)

/** List Google Docs files. */
router.get('/files', driveController.listFiles)

/** Export a single Google Doc as clean HTML. */
router.get('/files/:fileId/export', driveController.exportFile)

export default router
