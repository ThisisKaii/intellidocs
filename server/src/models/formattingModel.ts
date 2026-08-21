import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import {
  FormatPreset,
  FormatBinding,
  CreateFormatBindingRequest,
  UpdateFormatBindingRequest,
} from '../types/index'

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
  const { error } = await supabase
    .from('documents')
    .update({ formatting_preset: preset })
    .eq('id', documentId)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to set document preset: ${error.message}`)
}
