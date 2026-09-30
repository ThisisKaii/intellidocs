import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  Document,
  FormatPreset,
  FormatBinding,
  CreateFormatBindingRequest,
  UpdateFormatBindingRequest,
  UserPreset,
} from '../types/index'
import { snapshotDocumentVersion } from './documentModel'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

// ── Tier 1 — Presets ─────────────────────────────────────────────────────────

/** Return all predefined formatting presets (system + user-created). */
export async function getPresets(): Promise<FormatPreset[]> {
  const { data, error } = await supabase
    .from('formatting_presets')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw new Error(`Failed to get presets: ${error.message}`)
  return data || []
}

/** Return a single preset by key, or null if it does not exist. */
export async function getPresetByKey(key: string): Promise<FormatPreset | null> {
  const { data, error } = await supabase
    .from('formatting_presets')
    .select('*')
    .eq('key', key)
    .single()

  if (error) return null
  return data
}

// ── Tier 1b — User-forked presets (blueprint V2 versioning) ───────────────────

/** Return every blueprint fork owned by a user, newest fork last. */
export async function getUserPresets(userId: string): Promise<UserPreset[]> {
  const { data, error } = await supabase
    .from('user_presets')
    .select('*')
    .eq('user_id', userId)
    .order('version', { ascending: true })

  if (error) throw new Error(`Failed to get user presets: ${error.message}`)
  return (data || []) as UserPreset[]
}

/** Return one of the current user's preset forks by key, or null. */
export async function getUserPresetByKey(
  userId: string,
  key: string
): Promise<UserPreset | null> {
  const { data, error } = await supabase
    .from('user_presets')
    .select('*')
    .eq('user_id', userId)
    .eq('key', key)
    .maybeSingle()

  if (error) return null
  return (data as UserPreset | null) ?? null
}

/**
 * Resolve a preset key against the standard blueprints first, then the user's
 * own forks. A document's `formatting_preset` may hold either kind of key.
 */
export async function resolvePresetKey(
  userId: string,
  key: string
): Promise<FormatPreset | UserPreset | null> {
  const standard = await getPresetByKey(key)
  if (standard) return standard
  return getUserPresetByKey(userId, key)
}

/**
 * Fork a standard blueprint into a per-user preset, bumping the version number
 * each time so repeated customisation yields "... (Custom v2)", "(Custom v3)".
 */
export async function createUserPreset(
  userId: string,
  baseKey: string,
  overrides: Partial<Pick<UserPreset, 'name' | 'description' | 'rules'>>
): Promise<UserPreset> {
  const base = await getPresetByKey(baseKey)
  if (!base) {
    throw new Error(`Unknown base preset "${baseKey}"`)
  }

  const existing = await getUserPresets(userId)
  const nextVersion =
    existing.filter((preset) => preset.base_key === baseKey).reduce(
      (highest, preset) => Math.max(highest, preset.version),
      1
    ) + 1

  const { data, error } = await supabase
    .from('user_presets')
    .insert({
      user_id: userId,
      key: `${baseKey}__v${nextVersion}`,
      base_key: baseKey,
      name: overrides.name?.trim() || `${base.name} (Custom v${nextVersion})`,
      description: overrides.description?.trim() || `Customised from ${base.name}`,
      rules: overrides.rules ?? base.rules,
      version: nextVersion,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to save custom preset: ${error.message}`)
  return data as UserPreset
}

/** Delete one of the current user's preset forks. */
export async function deleteUserPreset(userId: string, presetId: string): Promise<void> {
  const { error } = await supabase
    .from('user_presets')
    .delete()
    .eq('preset_id', presetId)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to delete custom preset: ${error.message}`)
}

// ── Tier 2 — Custom format bindings ──────────────────────────────────────────

/** Return all custom format bindings owned by a user, highest priority first. */
export async function getBindings(userId: string): Promise<FormatBinding[]> {
  const { data, error } = await supabase
    .from('format_bindings')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: false })

  if (error) throw new Error(`Failed to get bindings: ${error.message}`)
  return data || []
}

/** Create a custom format binding for a user. */
export async function createBinding(
  userId: string,
  req: CreateFormatBindingRequest
): Promise<FormatBinding> {
  const { data, error } = await supabase
    .from('format_bindings')
    .insert({
      user_id: userId,
      trigger_condition: req.trigger_condition,
      format_to_apply: req.format_to_apply,
      priority: req.priority,
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create binding: ${error.message}`)
  return data
}

/** Update a custom format binding owned by a user. */
export async function updateBinding(
  userId: string,
  bindingId: string,
  req: UpdateFormatBindingRequest
): Promise<FormatBinding> {
  const { data, error } = await supabase
    .from('format_bindings')
    .update(req)
    .eq('id', bindingId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw new Error(`Failed to update binding: ${error.message}`)
  return data
}

/** Delete a custom format binding owned by a user. */
export async function deleteBinding(
  userId: string,
  bindingId: string
): Promise<void> {
  const { error } = await supabase
    .from('format_bindings')
    .delete()
    .eq('id', bindingId)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to delete binding: ${error.message}`)
}

// ── Document ↔ preset association ────────────────────────────────────────────

/** Return the owner user id of a document, or null if it does not exist. */
export async function getOwnerOfDocument(
  documentId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('user_id')
    .eq('id', documentId)
    .single()

  if (error) return null
  return data?.user_id ?? null
}

/** Read the preset key currently assigned to a document. */
export async function getDocumentPreset(
  documentId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('documents')
    .select('formatting_preset')
    .eq('id', documentId)
    .eq('user_id', userId)
    .single()

  if (error) throw new Error(`Failed to read document preset: ${error.message}`)
  return data?.formatting_preset ?? null
}

/** Assign a preset key to a document (Tier 1 selection). */
export async function setDocumentPreset(
  documentId: string,
  userId: string,
  preset: string
): Promise<void> {
  const { data, error } = await supabase
    .from('documents')
    .update({ formatting_preset: preset })
    .eq('id', documentId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw new Error(`Failed to set document preset: ${error.message}`)

  // Preset-only changes need their own history entry so the user can roll
  // previous the format state back even when no content was touched.
  if (data) void snapshotDocumentVersion(data as Document, 'preset')
}
