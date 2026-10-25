import type { CreateDocumentRequest, PageLayout, PageNumberFormat } from '../types/index'
import type { PythonConversionResponse } from '../../schemas/predictionSchemas'
import { uploadImportImages } from './uploadImportImages'
import { sanitizeImportedHtml } from './sanitizeImportedHtml'

/** True when the sections need more than the document-wide header and numbering the editor already has. */
function needsLayout(py: PythonConversionResponse, hasParts: boolean, hasArt: boolean): boolean {
  const sections = py.hf?.sections ?? []
  const numbered = sections.some((s) => s.number_start !== null || s.number_format !== 'decimal' || s.title_pg)
  return hasParts || hasArt || numbered
}

/**
 * Turn the converter's page furniture into the fields a new document stores:
 * header/footer text and number formats, page setup, and (when the file has art,
 * per-section headers or restarting page numbers) a page layout with its pictures
 * moved to storage.
 */
export async function buildImportedLayout(
  userId: string,
  py: PythonConversionResponse,
): Promise<Partial<CreateDocumentRequest>> {
  const store = (html: string): Promise<string> => uploadImportImages(userId, html)
  const headerNumberFormat: PageNumberFormat = py.header_number_format ?? 'none'
  const footerNumberFormat: PageNumberFormat = py.footer_number_format ?? 'none'
  const [header, footer] = await Promise.all([store(py.header ?? ''), store(py.footer ?? '')])

  const parts: PageLayout['parts'] = {}
  for (const [key, part] of Object.entries(py.hf?.parts ?? {})) {
    parts[key] = { flow: await store(part.flow), art: await store(part.art) }
  }
  const repeatArt = await store(py.page_art?.repeat ?? '')
  const pageArt: PageLayout['page_art'] = {}
  for (const [page, html] of Object.entries(py.page_art?.pages ?? {})) pageArt[page] = await store(html)

  const overlays: NonNullable<PageLayout['overlays']> = {}
  for (const [id, box] of Object.entries(py.page_art?.overlays ?? {})) overlays[id] = { ...box, html: await store(box.html) }

  const hasParts = Object.keys(parts).length > 0
  const hasArt = repeatArt !== '' || Object.keys(pageArt).length > 0 || Object.keys(overlays).length > 0
  const layout: PageLayout | undefined = needsLayout(py, hasParts, hasArt)
    ? { sections: py.hf?.sections ?? [], parts, repeat_art: repeatArt, page_art: pageArt, overlays }
    : undefined

  return {
    header_content: sanitizeImportedHtml(header),
    footer_content: sanitizeImportedHtml(footer),
    // Word's header/footer exists on the page; the editor's is on whenever the
    // file had text, a PAGE field or art there (page numbers are re-created by
    // the editor, not stored as the frozen number Word last saved).
    show_header: header !== '' || headerNumberFormat !== 'none' || hasParts || hasArt,
    show_footer: footer !== '' || footerNumberFormat !== 'none' || hasParts || hasArt,
    header_number_format: headerNumberFormat,
    footer_number_format: footerNumberFormat,
    page_size: py.page_setup?.page_size,
    margins: py.page_setup?.margins,
    orientation: py.page_setup?.orientation,
    ...(layout ? { page_layout: layout } : {}),
  }
}
