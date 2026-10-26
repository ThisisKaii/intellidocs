import { Router } from 'express'
import * as driveController from '../controllers/driveController'
import { authMiddleware } from '../middleware/authMiddleware'
import { validateBody } from '../middleware/validate'
import { linkGoogleDriveSchema } from '../../schemas/driveLinkSchemas'

const router = Router()

/** Generate Google OAuth2 consent URL (authenticated). */
router.get('/auth-url', authMiddleware, driveController.getAuthUrl)

/** OAuth2 callback — public browser redirect endpoint from Google. */
router.get('/callback', driveController.handleCallback)

/** Check whether Google Drive is connected (authenticated). */
router.get('/status', authMiddleware, driveController.getConnectionStatus)

/** Disconnect Google Drive (authenticated). */
router.delete('/disconnect', authMiddleware, driveController.disconnect)

/**
 * Link the Google provider token from a Google sign-in session to this account.
 * The user id is taken from the JWT, so a token cannot be attached to anyone
 * else's account.
 */
router.post('/link-provider', authMiddleware, validateBody(linkGoogleDriveSchema), driveController.linkProviderToken)

/** Token + keys for Google's file picker, which replaces browsing the whole Drive (authenticated). */
router.get('/picker-config', authMiddleware, driveController.getPickerConfig)

/** Export a single Google Doc as clean HTML (authenticated). */
router.get('/files/:fileId/export', authMiddleware, driveController.exportFile)

/** Poll the progress of an async large-file import (authenticated). */
router.get('/imports/:jobId', authMiddleware, driveController.getImportStatus)

/** List the caller's recent import jobs so a reloaded client can re-attach (authenticated). */
router.get('/imports', authMiddleware, driveController.listImports)

export default router

