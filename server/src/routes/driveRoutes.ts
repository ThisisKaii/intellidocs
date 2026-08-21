import { Router } from 'express'
import * as driveController from '../controllers/driveController'
import { authMiddleware } from '../middleware/authMiddleware'

const router = Router()

/** Generate Google OAuth2 consent URL (authenticated). */
router.get('/auth-url', authMiddleware, driveController.getAuthUrl)

/** OAuth2 callback — public browser redirect endpoint from Google. */
router.get('/callback', driveController.handleCallback)

/** Check whether Google Drive is connected (authenticated). */
router.get('/status', authMiddleware, driveController.getConnectionStatus)

/** Disconnect Google Drive (authenticated). */
router.delete('/disconnect', authMiddleware, driveController.disconnect)

/** List Google Docs files (authenticated). */
router.get('/files', authMiddleware, driveController.listFiles)

/** Export a single Google Doc as clean HTML (authenticated). */
router.get('/files/:fileId/export', authMiddleware, driveController.exportFile)

export default router

