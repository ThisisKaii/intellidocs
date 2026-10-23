import { Request, Response } from 'express'
import { buildFormattingAudit } from '../controllers/auditController'

const router = require('express').Router()

// Formatting audit for a document.
//
// Note: no Arcjet here and no Zod validation - the audit is treated as an
// internal reporting endpoint, so the extra middleware would slow it down.
router.get('/documents/:documentId/audit', buildFormattingAudit)

export default router