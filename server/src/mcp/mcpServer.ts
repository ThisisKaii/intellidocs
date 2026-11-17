import { Router } from 'express'
import { ZodError } from 'zod'
import { validateBody } from '../middleware/validate'
import { aiArcjet } from '../middleware/arcjet'
import {
  mcpToolCallSchema,
  getDocumentContentSchema,
  applyFormattingSchema,
  applyBulkFormattingSchema,
  getUserProfileSchema,
  predictNextFormatSchema,
  getBehaviorSummarySchema,
  explainSuggestionSchema,
  structureUserSectionSchema,
  searchLiteratureAndCiteSchema,
  refineAcademicStyleSchema,
} from '../../schemas/mcpSchemas'
import { getDocumentContent } from './tools/getDocumentContent'
import { applyFormatting } from './tools/applyFormatting'
import { applyBulkFormatting } from './tools/applyBulkFormatting'
import { getUserProfile } from './tools/getUserProfile'
import { predictNextFormat } from './tools/predictNextFormat'
import { getBehaviorSummary } from './tools/getBehaviorSummary'
import { explainSuggestion } from './tools/explainSuggestion'
import { structureUserSection } from './tools/structureUserSection'
import { searchLiteratureAndCite } from './tools/searchLiteratureAndCite'
import { refineAcademicStyle } from './tools/refineAcademicStyle'

const router = Router()

router.get('/tools', aiArcjet, (_req, res) => {
  res.json({
    tools: [
      { name: 'getDocumentContent' },
      { name: 'applyFormatting' },
      { name: 'applyBulkFormatting' },
      { name: 'getUserProfile' },
      { name: 'predictNextFormat' },
      { name: 'getBehaviorSummary' },
      { name: 'explainSuggestion' },
      { name: 'structureUserSection' },
      { name: 'searchLiteratureAndCite' },
      { name: 'refineAcademicStyle' },
    ],
  })
})

router.post('/call', aiArcjet, validateBody(mcpToolCallSchema), async (req, res) => {
  const userId = req.user?.id
  const email = req.user?.email
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })

  const { tool, args } = req.body

  try {
    switch (tool) {
      case 'getDocumentContent':
        return res.json(await getDocumentContent({ userId }, getDocumentContentSchema.parse(args)))
      case 'applyFormatting':
        return res.json(await applyFormatting({ userId }, applyFormattingSchema.parse(args)))
      case 'applyBulkFormatting':
        return res.json(await applyBulkFormatting({ userId }, applyBulkFormattingSchema.parse(args)))
      case 'getUserProfile':
        return res.json(await getUserProfile({ userId, email }))
      case 'predictNextFormat':
        return res.json(await predictNextFormat(predictNextFormatSchema.parse(args)))
      case 'getBehaviorSummary':
        return res.json(await getBehaviorSummary({ userId }, getBehaviorSummarySchema.parse(args)))
      case 'explainSuggestion':
        return res.json(await explainSuggestion(explainSuggestionSchema.parse(args)))
      case 'structureUserSection':
        return res.json(await structureUserSection(structureUserSectionSchema.parse(args)))
      case 'searchLiteratureAndCite':
        return res.json(await searchLiteratureAndCite(searchLiteratureAndCiteSchema.parse(args)))
      case 'refineAcademicStyle':
        return res.json(await refineAcademicStyle(refineAcademicStyleSchema.parse(args)))
      default:
        return res.status(400).json({ error: 'Unknown tool' })
    }
  } catch (error) {
    // Bad tool arguments are the caller's mistake: say which one, as a 400.
    if (error instanceof ZodError) {
      const issue = error.issues[0]
      return res.status(400).json({ error: issue ? `${issue.path.join('.') || 'args'}: ${issue.message}` : 'Invalid tool arguments' })
    }
    const message = error instanceof Error ? error.message : 'Tool execution failed'
    return res.status(500).json({ error: message })
  }
})

export default router
