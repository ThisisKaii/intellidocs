import { Request, Response } from 'express'
import * as formattingModel from '../models/formattingModel'
import {
  CreateFormatBindingRequest,
  CreateUserPresetRequest,
  UpdateFormatBindingRequest,
} from '../types/index'
import { resolveFormattingTier } from '../skills/resolveFormattingTier'
import { inferDocumentStructure } from '../skills/inferDocumentStructure'
import { predictFormat } from '../skills/predictFormat'
import { consumeAIQuota } from '../models/aiQuotaModel'
import { GENRE_BASE_PRESET_KEY } from '../utils/documentGenre'

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

    const body = req.body as CreateUserPresetRequest
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

      const prediction = await predictFormat({ text, userId: effectiveUserId, genre })

      // Learned text→format match from the user's documents of the same genre.
      if (prediction.learned) {
        res.status(200).json({
          tier: 'learned',
          format: prediction.learned.format,
          confidence: prediction.learned.confidence,
          bold: prediction.learned.bold,
          italic: prediction.learned.italic,
          underline: prediction.learned.underline,
          fontSize: prediction.learned.fontSize,
          textAlign: prediction.learned.textAlign,
          snippet: prediction.learned.snippet,
          genre,
          reason: 'Matches formatting you applied to similar text in another document of this type',
        })
        return
      }

      // The user's own model for this genre contributed.
      if (prediction.genrePartitionHit) {
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
