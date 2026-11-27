import { Request, Response } from 'express'
import * as formattingModel from '../models/formattingModel'
import { buildPresetFromFile } from '../skills/buildPresetFromFile'
import type { ImportUserPresetInput } from '../../schemas/formattingSchemas'
import {
  CreateFormatBindingRequest,
  CreateUserPresetRequest,
  UpdateFormatBindingRequest,
} from '../types/index'
import { resolveFormattingTier } from '../skills/resolveFormattingTier'
import { inferDocumentStructure } from '../skills/inferDocumentStructure'
import { predictFormat } from '../skills/predictFormat'
import { matchLearnedFormat } from '../skills/matchLearnedFormat'
import type { DocumentGenre, LearnedFormatMatch } from '../types/index'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { GENRE_BASE_PRESET_KEY } from '../utils/documentGenre'
import { canUsePreset, PRESET_LOCKED_CODE } from '../skills/canUsePreset'
import { getOwnRoleStatus } from '../models/userModel'
import { buildPresetFromDocument } from '../skills/buildPresetFromDocument'

/** Read and validate the current user id from the authenticated request. */
function getUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  return userId
}

// ── Tier 1 — Presets ─────────────────────────────────────────────────────────

/** Return all predefined formatting presets. */
export async function getPresets(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const presets = await formattingModel.getPresets()
    res.status(200).json({ presets })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get presets'
    res.status(500).json({ error: message })
  }
}

// ── Tier 1b — User-forked presets (blueprint V2 versioning) ───────────────────

/** Return every blueprint fork owned by the current user. */
export async function listUserPresets(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const presets = await formattingModel.getUserPresets(userId)
    res.status(200).json({ presets })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get custom presets'
    res.status(500).json({ error: message })
  }
}

/**
 * Fork a standard blueprint into a personal preset. The version number is
 * derived server-side so two forks of the same base never collide.
 */
export async function createUserPreset(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const body = req.body as CreateUserPresetRequest & { documentId?: string }
    // Saved from a document the user restyled: the version takes that document's look. Without
    // editor JSON to read, or before migration 047, it is a plain copy of the base preset.
    if (body.documentId) {
      const blueprint = await buildPresetFromDocument(userId, body.documentId)
      if (blueprint) {
        try {
          const preset = await formattingModel.createBlueprintPreset(userId, {
            name: body.name,
            description: body.description?.trim() || 'Saved from your document',
            baseKey: body.baseKey,
            blueprint,
          })
          res.status(201).json(preset)
          return
        } catch (error) {
          if (!(error instanceof formattingModel.MissingBlueprintColumnError)) throw error
        }
      }
    }
    const preset = await formattingModel.createUserPreset(userId, body.baseKey, {
      name: body.name,
      description: body.description,
      rules: body.rules,
    })
    res.status(201).json(preset)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save custom preset'
    res.status(400).json({ error: message })
  }
}

/** Status a thrown error asks for (validation errors carry one), else the fallback. */
function statusOf(error: unknown, fallback: number): number {
  if (error instanceof formattingModel.MissingBlueprintColumnError) return 503
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : fallback
}

/**
 * The base a user's own preset is filed under. Its look comes from its blueprint, so a user
 * without thesis access whose document reads closest to the thesis preset gets the general
 * preset as its base instead of a preset they cannot open.
 */
async function unlockedBase(userId: string, baseKey: string): Promise<string> {
  const { role } = await getOwnRoleStatus(userId)
  return canUsePreset(role, baseKey) ? baseKey : 'apa_7th'
}

/**
 * Make a preset from an uploaded document already in the user's format: its page, body text,
 * heading looks and section outline become the preset's blueprint.
 */
export async function createUserPresetFromFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return
    if (!req.file) {
      res.status(400).json({ error: 'Choose a .docx or .pdf file to make the preset from.' })
      return
    }
    const { blueprint, baseKey: closest, title } = await buildPresetFromFile({ buffer: req.file.buffer, originalname: req.file.originalname })
    const baseKey = await unlockedBase(userId, closest)
    const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim().slice(0, 120) : title.slice(0, 120)
    const preset = await formattingModel.createBlueprintPreset(userId, {
      name,
      description: `Made from ${req.file.originalname}`.slice(0, 400),
      baseKey,
      blueprint,
    })
    res.status(201).json(preset)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to make a preset from the file'
    res.status(statusOf(error, 500)).json({ error: message })
  }
}

/** Add a preset someone shared (a .idocpreset file) to the current user's presets. */
export async function importUserPreset(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return
    const body = req.body as ImportUserPresetInput
    const preset = await formattingModel.createBlueprintPreset(userId, {
      name: body.name,
      description: body.description ?? '',
      baseKey: await unlockedBase(userId, body.baseKey),
      blueprint: body.blueprint,
    })
    res.status(201).json(preset)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import the preset'
    res.status(statusOf(error, 400)).json({ error: message })
  }
}

/** Delete one of the current user's blueprint forks. */
export async function deleteUserPreset(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const presetId = req.params.id?.trim()
    if (!presetId) {
      res.status(400).json({ error: 'Preset ID is required' })
      return
    }

    await formattingModel.deleteUserPreset(userId, presetId)
    res.status(204).send()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete custom preset'
    res.status(500).json({ error: message })
  }
}

/** Assign a formatting preset to a document (Tier 1 selection). */
export async function setDocumentPreset(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const documentId = req.params.documentId?.trim()
    const preset = (req.body as { preset: string }).preset

    if (!documentId) {
      res.status(400).json({ error: 'Document ID is required' })
      return
    }

    const presetExists = await formattingModel.resolvePresetKey(userId, preset)
    if (!presetExists) {
      res.status(400).json({ error: `Unknown preset "${preset}"` })
      return
    }

    const { role } = await getOwnRoleStatus(userId)
    if (!canUsePreset(role, preset)) {
      res.status(403).json({ error: 'Thesis presets require verified student status.', code: PRESET_LOCKED_CODE })
      return
    }

    await formattingModel.setDocumentPreset(documentId, userId, preset)
    res.status(200).json({ message: `Preset "${preset}" applied` })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to set preset'
    res.status(500).json({ error: message })
  }
}

// ── Tier 2 — Custom format bindings ──────────────────────────────────────────

/** Return all custom format bindings owned by the current user. */
export async function listBindings(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const bindings = await formattingModel.getBindings(userId)
    res.status(200).json({ bindings })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get bindings'
    res.status(500).json({ error: message })
  }
}

/** Create a custom format binding for the current user. */
export async function createBinding(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const body = req.body as CreateFormatBindingRequest
    const binding = await formattingModel.createBinding(userId, body)
    res.status(201).json(binding)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create binding'
    res.status(500).json({ error: message })
  }
}

/** Update a custom format binding owned by the current user. */
export async function updateBinding(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const bindingId = req.params.id?.trim()
    if (!bindingId) {
      res.status(400).json({ error: 'Binding ID is required' })
      return
    }

    const body = req.body as UpdateFormatBindingRequest
    const binding = await formattingModel.updateBinding(userId, bindingId, body)
    res.status(200).json(binding)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update binding'
    res.status(500).json({ error: message })
  }
}

/** Delete a custom format binding owned by the current user. */
export async function deleteBinding(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const bindingId = req.params.id?.trim()
    if (!bindingId) {
      res.status(400).json({ error: 'Binding ID is required' })
      return
    }

    await formattingModel.deleteBinding(userId, bindingId)
    res.status(204).send()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete binding'
    res.status(500).json({ error: message })
  }
}

// ── Document structure inference ─────────────────────────────────────────────

/**
 * Infer the academic archetype of a document's opening text so the editor can
 * offer to apply the matching standard format when no preset is set yet.
 */
export async function inferStructure(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const text = (req.body as { text: string }).text
    const structure = inferDocumentStructure(text)
    res.status(200).json(structure)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Structure inference failed'
    res.status(500).json({ error: message })
  }
}

// ── Three-tier check ─────────────────────────────────────────────────────────

/** Confidence reported for a genre base-preset rule match. */
const GENRE_PRESET_CONFIDENCE = 0.8

/** The tier-check answer for a habit learned in another document of the genre. */
function learnedTierBody(learned: LearnedFormatMatch, genre: DocumentGenre): Record<string, unknown> {
  return {
    tier: 'learned',
    format: learned.format,
    confidence: learned.confidence,
    bold: learned.bold,
    italic: learned.italic,
    underline: learned.underline,
    fontSize: learned.fontSize,
    textAlign: learned.textAlign,
    snippet: learned.snippet,
    genre,
    reason: 'Matches formatting you applied to similar text in another document of this type',
  }
}

/**
 * Resolve the formatting decision for a text block, strictly within the document's genre:
 * 1. custom binding → document preset rule
 * 2. the genre's learned patterns → the genre's personal ML model
 * 3. the genre's base preset
 * 4. the neutral pretrained model (no user data)
 * Another genre's patterns or models are never consulted.
 */
export async function tierCheck(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const text = (req.body as { text: string }).text
    const documentId = (req.body as { documentId: string }).documentId

    // Live-collab personalization: resolve the document's own owner and use
    // their bindings/preset, so a shared collaborator inherits the document's
    // formatting personality instead of their own (or a 500 for non-owners).
    const ownerId = await formattingModel.getOwnerOfDocument(documentId)
    const effectiveUserId = ownerId ?? userId

    const [bindings, presetKey, genre] = await Promise.all([
      formattingModel.getBindings(effectiveUserId),
      formattingModel.getDocumentPreset(documentId, effectiveUserId),
      formattingModel.getDocumentGenre(documentId),
    ])

    const presetRules = presetKey
      ? (await formattingModel.resolvePresetKey(effectiveUserId, presetKey))?.rules ?? []
      : []

    const tierResult = resolveFormattingTier({ text, bindings, presetRules })

    // The user's own formatting comes before any style: after their explicit bindings, what they
    // did by hand to this kind of line in another document of the genre (14pt, bold, centred) wins
    // over a preset rule or the model's guess (Heading 2).
    if (tierResult.tier !== 'binding') {
      const learned = await matchLearnedFormat(effectiveUserId, genre, text)
      if (learned) {
        res.status(200).json(learnedTierBody(learned, genre))
        return
      }
    }

    // Genre partition: learned patterns and personal model, then genre base preset, then neutral ML.
    if (tierResult.tier === 'none') {
      const quota = await consumeAIQuota(userId, 'tier-check')
      if (!quota.allowed) {
        res.status(429).json({
          error: 'AI request quota exceeded',
          quota: {
            limit: quota.limit,
            remaining: quota.remaining,
            resetInSeconds: quota.resetInSeconds,
          },
        })
        return
      }

      // The ML service may be down or slow: then answer from the genre's base preset (below)
      // instead of failing the suggestion check.
      const prediction = await predictFormat({ text, userId: effectiveUserId, genre }).catch((error: unknown) => {
        console.warn('Formatting prediction unavailable; using the genre preset:', error instanceof Error ? error.message : error)
        return null
      })

      // Learned text→format match from the user's documents of the same genre.
      if (prediction?.learned) {
        res.status(200).json(learnedTierBody(prediction.learned, genre))
        return
      }

      // The user's own model for this genre contributed.
      if (prediction?.genrePartitionHit) {
        res.status(200).json({
          tier: 'ml',
          format: prediction.predictedFormat,
          confidence: prediction.confidence,
          feature_values: prediction.featureValues,
          genre,
        })
        return
      }

      // No personal signal in this genre: the genre's own base preset, never another genre's data.
      const basePreset = await formattingModel.getPresetByKey(GENRE_BASE_PRESET_KEY[genre])
      const baseResult = resolveFormattingTier({ text, bindings: [], presetRules: basePreset?.rules ?? [] })
      if (baseResult.tier === 'preset') {
        res.status(200).json({
          tier: 'genre_preset',
          format: baseResult.format,
          // A rule match, offered as a suggestion (the client never auto-applies this tier).
          confidence: GENRE_PRESET_CONFIDENCE,
          reason: baseResult.reason,
          genre,
        })
        return
      }

      // No prediction (the ML service is unreachable) and no preset rule: nothing to suggest.
      if (!prediction) {
        res.status(200).json({ tier: 'none', reason: 'Suggestions are unavailable right now', genre })
        return
      }

      // Neutral pretrained model: holds no user behavior, so it cannot leak across genres.
      res.status(200).json({
        tier: 'ml',
        format: prediction.predictedFormat,
        confidence: prediction.confidence,
        feature_values: prediction.featureValues,
        genre,
      })
      return
    }

    res.status(200).json({
      tier: tierResult.tier,
      format: tierResult.format,
      reason: tierResult.reason,
      genre,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tier check failed'
    res.status(500).json({ error: message })
  }
}
