import type { PresetBlueprint } from '../../schemas/formattingSchemas'
import type { EditorJson, PageNumberFormat } from '../types/index'

/**
 * Read a formatting blueprint from a converted document: page size and margins, the body text's
 * font, size, spacing, indent and alignment, how each heading level looks, and the outline of
 * section headings. A student or professor uploads a document already in their format and it
 * becomes one of their presets.
 *
 * Every value is the document's usual one (weighted by how much text uses it), so a stray
 * centred paragraph or one 14pt line does not decide the preset.
 */

interface PageSetup {
  page_size: PresetBlueprint['pageSize']
  orientation: PresetBlueprint['orientation']
  margins: PresetBlueprint['margins']
}

interface JsonNode {
  type?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>
  text?: string
  content?: JsonNode[]
}

interface Block {
  type: 'paragraph' | 'heading'
  level: number
  text: string
  sizePt: number | null
  lineHeight: number | null
  indentIn: number | null
  align: 'left' | 'center' | 'right' | 'justify'
  bold: boolean
  italic: boolean
  family: string | null
}

/** Body paragraphs are at least this long; shorter lines are titles, labels and captions. */
const BODY_MIN_CHARS = 150
const MAX_SECTIONS = 80
const DEFAULT_FAMILY = "'Times New Roman', serif"

/** The value most of the weight sits on. */
function usual<T>(entries: Array<{ value: T; weight: number }>): T | null {
  const totals = new Map<string, { value: T; weight: number }>()
  for (const { value, weight } of entries) {
    const key = JSON.stringify(value)
    const current = totals.get(key)
    totals.set(key, { value, weight: (current?.weight ?? 0) + weight })
  }
  let best: { value: T; weight: number } | null = null
  for (const entry of totals.values()) if (!best || entry.weight > best.weight) best = entry
  return best?.value ?? null
}

function styleValue(style: string, property: string): string | null {
  const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i').exec(style)
  return match ? match[1].trim() : null
}

function points(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^([\d.]+)\s*(pt|px)?$/i.exec(value.trim())
  if (!match) return null
  const number = Number(match[1])
  return match[2]?.toLowerCase() === 'px' ? (number * 72) / 96 : number
}

/** A CSS font list without repeats: "'Times New Roman', 'Times New Roman', serif" → "'Times New Roman', serif". */
function cleanFamily(family: string): string | null {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const part of family.split(',')) {
    const name = part.trim()
    const key = name.replace(/['"]/g, '').toLowerCase()
    if (!name || seen.has(key) || !/^[\w\s'".-]+$/.test(name)) continue
    seen.add(key)
    parts.push(name)
  }
  return parts.length > 0 ? parts.join(', ').slice(0, 120) : null
}

function readBlock(node: JsonNode): Block | null {
  if (node.type !== 'paragraph' && node.type !== 'heading') return null
  const attrs = node.attrs ?? {}
  const style = typeof attrs.style === 'string' ? attrs.style : ''
  let text = ''
  let boldChars = 0
  let italicChars = 0
  const families: Array<{ value: string; weight: number }> = []
  const sizes: Array<{ value: number; weight: number }> = []
  for (const child of node.content ?? []) {
    if (child.type !== 'text' || !child.text) continue
    const length = child.text.trim().length
    text += child.text
    const marks = child.marks ?? []
    if (marks.some((mark) => mark.type === 'bold')) boldChars += length
    if (marks.some((mark) => mark.type === 'italic')) italicChars += length
    const textStyle = marks.find((mark) => mark.type === 'textStyle')?.attrs ?? {}
    if (typeof textStyle.fontFamily === 'string' && textStyle.fontFamily) families.push({ value: textStyle.fontFamily, weight: length })
    const size = points(typeof textStyle.fontSize === 'string' ? textStyle.fontSize : null)
    if (size) sizes.push({ value: size, weight: length })
  }
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (!trimmed) return null
  const total = Math.max(1, trimmed.length)
  const align = attrs.textAlign
  const lineHeight = Number(styleValue(style, 'line-height'))
  const indentPt = points(styleValue(style, 'text-indent'))
  return {
    type: node.type,
    level: Number(attrs.level) || 0,
    text: trimmed,
    sizePt: usual(sizes) ?? points(styleValue(style, 'font-size')),
    lineHeight: Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : null,
    indentIn: indentPt === null ? null : indentPt / 72,
    align: align === 'center' || align === 'right' || align === 'justify' ? align : 'left',
    bold: boldChars / total >= 0.6 || /font-weight:\s*(?:bold|[6-9]00)/i.test(style),
    italic: italicChars / total >= 0.6,
    family: usual(families),
  }
}

/** Every top-level paragraph and heading, in order (tables and their cells are left out). */
function blocksOf(doc: EditorJson): Block[] {
  const blocks: Block[] = []
  const walk = (nodes: JsonNode[] | undefined): void => {
    for (const node of nodes ?? []) {
      if (node.type === 'table') continue
      const block = readBlock(node)
      if (block) blocks.push(block)
      else if (node.type !== 'paragraph' && node.type !== 'heading') walk(node.content)
    }
  }
  walk(doc.content as JsonNode[] | undefined)
  return blocks
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function sizeText(pt: number): string {
  const rounded = Math.round(pt * 2) / 2
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}pt`
}

function headingStyle(blocks: Block[], fallback: PresetBlueprint['headings']['level1']): PresetBlueprint['headings']['level1'] {
  if (blocks.length === 0) return fallback
  const weighted = <T>(read: (block: Block) => T): T | null => usual(blocks.map((block) => ({ value: read(block), weight: 1 })))
  const align = weighted((block) => (block.align === 'justify' ? 'left' : block.align)) ?? fallback.textAlign
  const size = weighted((block) => block.sizePt)
  const upper = blocks.filter((block) => /[a-z]/i.test(block.text) && block.text === block.text.toUpperCase()).length
  return {
    textAlign: align,
    fontSize: size ? sizeText(size) : fallback.fontSize,
    fontWeight: (weighted((block) => block.bold) ?? fallback.fontWeight === 700) ? 700 : 400,
    fontStyle: weighted((block) => block.italic) ? 'italic' : 'normal',
    textTransform: upper * 10 >= blocks.length * 7 ? 'uppercase' : 'none',
  }
}

/** The built-in preset a blueprint is closest to; it answers anything the blueprint does not. */
export function closestBasePreset(blueprint: PresetBlueprint): string {
  const size = Number(blueprint.baseFontSize.replace('pt', ''))
  if (size <= 10) return 'ieee'
  if (blueprint.margins.left >= 1.4) return 'uclm_capstone'
  return 'apa_7th'
}

/** Read the blueprint of a converted document. */
export function extractPresetBlueprint(
  doc: EditorJson,
  pageSetup: PageSetup,
  pageNumbers: PageNumberFormat = 'none',
): PresetBlueprint {
  const blocks = blocksOf(doc)
  const body = blocks.filter((block) => block.type === 'paragraph' && block.text.length >= BODY_MIN_CHARS)
  const bodyWeights = <T>(read: (block: Block) => T): Array<{ value: T; weight: number }> =>
    body.map((block) => ({ value: read(block), weight: block.text.length }))

  const bodySize = usual(bodyWeights((block) => block.sizePt).filter((entry) => entry.value !== null)) ?? 12
  const lineHeight = usual(bodyWeights((block) => (block.lineHeight === null ? null : roundTo(block.lineHeight, 0.05))).filter((entry) => entry.value !== null)) ?? 2
  const indent = usual(bodyWeights((block) => roundTo(block.indentIn ?? 0, 0.05))) ?? 0.5
  const family = cleanFamily(usual(bodyWeights((block) => block.family).filter((entry) => entry.value !== null)) ?? '') ?? DEFAULT_FAMILY
  const bodyAlign = usual(bodyWeights((block) => block.align)) ?? 'left'

  const base = { textAlign: 'left' as const, fontSize: sizeText(bodySize), fontWeight: 700 as const, fontStyle: 'normal' as const, textTransform: 'none' as const }
  const level1 = headingStyle(blocks.filter((block) => block.type === 'heading' && block.level === 1), { ...base, textAlign: 'center' })
  const level2 = headingStyle(blocks.filter((block) => block.type === 'heading' && block.level === 2), { ...level1, textAlign: 'left', textTransform: 'none' })
  const level3 = headingStyle(blocks.filter((block) => block.type === 'heading' && block.level === 3), { ...level2 })

  const sections = blocks
    .filter((block) => block.type === 'heading' && block.level >= 1 && block.level <= 3)
    .slice(0, MAX_SECTIONS)
    .map((block) => ({ level: block.level, text: block.text.slice(0, 160) }))

  const clamp = (value: number): number => Math.min(4, Math.max(0, Math.round(value * 100) / 100))
  return {
    version: 1,
    pageSize: pageSetup.page_size,
    orientation: pageSetup.orientation,
    margins: {
      top: clamp(pageSetup.margins.top),
      bottom: clamp(pageSetup.margins.bottom),
      left: clamp(pageSetup.margins.left),
      right: clamp(pageSetup.margins.right),
    },
    fontFamily: family,
    baseFontSize: sizeText(bodySize),
    lineHeight: Math.min(3.5, Math.max(0.8, Math.round(lineHeight * 100) / 100)),
    firstLineIndent: `${Math.min(9.99, Math.max(0, Math.round(indent * 100) / 100))}in`,
    bodyAlign,
    headings: { level1, level2, level3 },
    pageNumbers,
    sections,
  }
}
