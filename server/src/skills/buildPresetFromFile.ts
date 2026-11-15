import { requestDocumentConversion } from '../ai/bridge/pythonBridge'
import type { PresetBlueprint } from '../../schemas/formattingSchemas'
import type { EditorJson } from '../types/index'
import { closestBasePreset, extractPresetBlueprint } from './extractPresetBlueprint'
import { validateImportUpload, type ImportUpload } from './validateImportUpload'
import { waitForConverter } from './waitForConverter'

function badRequest(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 })
}

/**
 * Turn an uploaded .docx or .pdf into a preset blueprint: the converter reads the file (the same
 * one imports use, so styles come through Word's inheritance), then its layout is summarised.
 * Returns the blueprint, the built-in preset it is closest to and a name from the file.
 */
export async function buildPresetFromFile(
  file: ImportUpload
): Promise<{ blueprint: PresetBlueprint; baseKey: string; title: string }> {
  const { effectiveExt, title } = validateImportUpload(file)
  if (effectiveExt !== '.docx' && effectiveExt !== '.pdf') {
    throw badRequest('A preset is made from a Word (.docx) or PDF file.')
  }
  const wake = await waitForConverter(async () => undefined)
  if (!wake.reachable) {
    throw Object.assign(new Error('The document converter is not reachable right now. Try again in a minute.'), { status: 503 })
  }
  const converted = await requestDocumentConversion(file.buffer, file.originalname)
  if (!converted.content_json) throw badRequest('The file could not be read for its formatting.')
  const pageNumbers = converted.footer_number_format && converted.footer_number_format !== 'none'
    ? converted.footer_number_format
    : converted.header_number_format ?? 'none'
  const blueprint = extractPresetBlueprint(converted.content_json as EditorJson, converted.page_setup, pageNumbers)
  return { blueprint, baseKey: closestBasePreset(blueprint), title }
}
