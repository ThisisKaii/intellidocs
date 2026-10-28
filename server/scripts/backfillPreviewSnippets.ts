/**
 * One-off: recompute every document's `preview_snippet` with the current
 * extractor so old thumbnails pick up fonts, alignment, tables and images.
 * Derived data only (the `content` column is never written).
 *
 * Run from server/:  npx tsx scripts/backfillPreviewSnippets.ts
 */
import { supabase } from '../src/models/documentModel'
import { extractPreviewSnippet } from '../src/utils/previewSnippet'

const PAGE_SIZE = 200

/** Fetch one page of document ids (content is loaded one document at a time). */
async function listIds(offset: number): Promise<string[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id')
    .order('created_at', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: { id: string }) => row.id)
}

/** Recompute and store the preview for one document; returns false when it was skipped. */
async function backfillOne(id: string): Promise<boolean> {
  const { data, error } = await supabase.from('documents').select('content').eq('id', id).single()
  if (error || !data) return false
  const snippet = extractPreviewSnippet((data as { content: string | null }).content ?? '')
  const { error: updateError } = await supabase.from('documents').update({ preview_snippet: snippet }).eq('id', id)
  return !updateError
}

/** Walk every document page by page and report how many were updated. */
async function main(): Promise<void> {
  let offset = 0
  let updated = 0
  let skipped = 0
  for (;;) {
    const ids = await listIds(offset)
    if (ids.length === 0) break
    for (const id of ids) {
      if (await backfillOne(id)) updated += 1
      else skipped += 1
    }
    offset += PAGE_SIZE
  }
  console.log(`preview_snippet backfill: ${updated} updated, ${skipped} skipped`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
