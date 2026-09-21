import { Request, Response } from 'express'
import { profileImportSchema, type ProfileScope } from '../../schemas/profileSchemas'
import * as formattingModel from '../models/formattingModel'
import * as personalizationModel from '../models/personalizationModel'

/** Read and validate the current user id from the authenticated request. */
function getUserId(req: Request, res: Response): string | null {
  const userId = req.user?.id

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }

  return userId
}

/** Narrow an unknown scope query value to a valid profile scope. */
function isScope(value: unknown): value is ProfileScope {
  return value === 'formatting' || value === 'grammar' || value === 'both'
}

/** Union two string lists preserving existing order, then unseen items. */
function mergeUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing)
  const merged = [...existing]
  for (const item of incoming) {
    if (!seen.has(item)) {
      seen.add(item)
      merged.push(item)
    }
  }
  return merged
}

/** Build and download the user's .idocprofile bundle (scope-limited). */
export async function exportProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const rawScope = req.query.scope
    const scope: ProfileScope = isScope(rawScope) ? rawScope : 'both'

    const [bindings, dictionary, ignoredPatterns] = await Promise.all([
      scope === 'grammar'
        ? Promise.resolve([])
        : formattingModel.getBindings(userId),
      scope === 'formatting'
        ? Promise.resolve([])
        : personalizationModel.getStringListSetting(userId, 'custom_dictionary'),
      scope === 'formatting'
        ? Promise.resolve([])
        : personalizationModel.getStringListSetting(userId, 'ignored_patterns'),
    ])

    const bundle = {
      version: '1.0',
      creator_email: req.user?.email ?? '',
      exported_at: new Date().toISOString(),
      scope,
      formatting: {
        custom_bindings: bindings.map((binding) => ({
          trigger_condition: binding.trigger_condition,
          format_to_apply: binding.format_to_apply,
          priority: binding.priority,
        })),
      },
      grammar_spelling: {
        custom_dictionary: dictionary,
        ignored_patterns: ignoredPatterns,
      },
    }

    res.setHeader('Content-Disposition', 'attachment; filename="intellidocs-profile.idocprofile"')
    res.status(200).json(bundle)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile export failed'
    res.status(500).json({ error: message })
  }
}

/** Validate, preview-rediff, and merge an imported .idocprofile bundle. */
export async function importProfile(req: Request, res: Response): Promise<void> {
  try {
    const userId = getUserId(req, res)
    if (!userId) return

    const input = profileImportSchema.parse(req.body)

    let addedBindings = 0
    let skippedBindings = 0
    if (input.scope !== 'grammar') {
      const existing = await formattingModel.getBindings(userId)
      const existingKeys = new Set(
        existing.map(
          (binding) => `${JSON.stringify(binding.trigger_condition)}|${binding.format_to_apply}`
        )
      )

      for (const binding of input.formatting?.custom_bindings ?? []) {
        const key = `${JSON.stringify(binding.trigger_condition)}|${binding.format_to_apply}`
        if (existingKeys.has(key)) {
          skippedBindings += 1
          continue
        }
        await formattingModel.createBinding(userId, binding)
        existingKeys.add(key)
        addedBindings += 1
      }
    }

    let addedWords = 0
    let addedPatterns = 0
    if (input.scope !== 'formatting') {
      const dictionary = await personalizationModel.getStringListSetting(userId, 'custom_dictionary')
      const mergedDictionary = mergeUnique(dictionary, input.grammar_spelling?.custom_dictionary ?? [])
      addedWords = mergedDictionary.length - dictionary.length
      await personalizationModel.setStringListSetting(userId, 'custom_dictionary', mergedDictionary)

      const patterns = await personalizationModel.getStringListSetting(userId, 'ignored_patterns')
      const mergedPatterns = mergeUnique(patterns, input.grammar_spelling?.ignored_patterns ?? [])
      addedPatterns = mergedPatterns.length - patterns.length
      await personalizationModel.setStringListSetting(userId, 'ignored_patterns', mergedPatterns)
    }

    res.status(200).json({
      message: 'Personalization profile imported',
      added_bindings: addedBindings,
      skipped_bindings: skippedBindings,
      added_words: addedWords,
      added_patterns: addedPatterns,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Profile import failed'
    res.status(500).json({ error: message })
  }
}