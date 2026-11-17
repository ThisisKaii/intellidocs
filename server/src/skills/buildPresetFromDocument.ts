import * as documentModel from '../models/documentModel'
import * as documentTabModel from '../models/documentTabModel'
import type { PresetBlueprint } from '../../schemas/formattingSchemas'
import type { EditorJson } from '../types/index'
import { hasTabBreaks } from '../utils/documentTabs'
import { extractPresetBlueprint } from './extractPresetBlueprint'

/** Tabs read for a tabbed document's headings: the front matter and first chapters show them all. */
const TABS_READ = 6

/**
 * The formatting blueprint of one of the user's documents (page setup, body text and heading looks),
 * read the way a preset is read from an uploaded file. Used when the user saves their own version of
 * a preset after restyling its headings. Null when the document has no editor JSON to read.
 */
export async function buildPresetFromDocument(userId: string, documentId: string): Promise<PresetBlueprint | null> {
  const doc = await documentModel.getDocumentById(documentId, userId)
  let json: EditorJson | null = doc.content_json ?? null
  if (hasTabBreaks(doc.content)) {
    const tabs = (await documentTabModel.listTabs(doc.id)).slice(0, TABS_READ)
    const content: unknown[] = []
    for (const tab of tabs) {
      const body = await documentTabModel.getTab(doc.id, tab.tab_id)
      content.push(...(((body.content_json?.content as unknown[] | undefined) ?? [])))
    }
    json = content.length > 0 ? ({ type: 'doc', content } as EditorJson) : null
  }
  if (!json) return null
  const pageNumbers = doc.footer_number_format && doc.footer_number_format !== 'none' ? doc.footer_number_format : doc.header_number_format ?? 'none'
  return extractPresetBlueprint(
    json,
    {
      page_size: (doc.page_size ?? 'letter') as PresetBlueprint['pageSize'],
      orientation: (doc.orientation ?? 'portrait') as PresetBlueprint['orientation'],
      margins: (doc.margins ?? { top: 1, bottom: 1, left: 1, right: 1 }) as PresetBlueprint['margins'],
    },
    pageNumbers,
  )
}
