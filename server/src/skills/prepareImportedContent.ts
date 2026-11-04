import { EDITOR_JSON_MAX_CHARS } from '../../schemas/documentSchemas'
import type { EditorJson } from '../types/index'
import { sanitizeImportedHtml } from './sanitizeImportedHtml'
import { uploadImportImagesWithSources, withStoredImageSources } from './uploadImportImages'

/**
 * An imported document's content as it is stored: its pictures moved to storage and its HTML cleaned,
 * with the converter's editor JSON kept beside it only while the two still describe the same document.
 *
 * The JSON (when the converter wrote one) is what the editor would read from the converter's HTML, so
 * it loads with no HTML parse. The same pictures are pointed at the same stored files in both. If the
 * clean-up changed the HTML's text the JSON would no longer match it, and the JSON is dropped: the
 * editor then parses the HTML, as it does for every import without JSON, and saves JSON from there.
 * The same happens when the JSON is over the stored size cap.
 */
export async function prepareImportedContent(
  userId: string,
  html: string,
  json: EditorJson | null | undefined,
): Promise<{ content: string; content_json: EditorJson | null }> {
  const { html: stored, stored: sources } = await uploadImportImagesWithSources(userId, html)
  const content = sanitizeImportedHtml(stored)
  if (!json) return { content, content_json: null }
  if (content !== stored) {
    console.warn('Imported HTML changed in clean-up; storing it without the converter JSON.')
    return { content, content_json: null }
  }
  const contentJson = withStoredImageSources(json, sources)
  if (JSON.stringify(contentJson).length > EDITOR_JSON_MAX_CHARS) {
    console.warn('Converter JSON is over the stored size cap; storing the HTML only.')
    return { content, content_json: null }
  }
  return { content, content_json: contentJson }
}
