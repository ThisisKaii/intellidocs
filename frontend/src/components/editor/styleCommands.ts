import type { Editor } from '@tiptap/react'
import { ACADEMIC_PRESETS, basePresetKey, type HeadingStyle } from './academicPresets'

/** A style tile shown in the styles ribbon. */
export interface StyleItem {
  format: string
  label: string
  hint: string
}

export const STYLE_ITEMS: StyleItem[] = [
  { format: 'normal', label: 'Normal', hint: 'Plain body paragraph' },
  { format: 'h1', label: 'Chapter', hint: 'Chapter / major heading · Bold · 18pt' },
  { format: 'h2', label: 'Section', hint: 'Section heading · Bold · 14.5pt' },
  { format: 'h3', label: 'Subsection', hint: 'Subsection heading · Bold · 12.5pt' },
  { format: 'title', label: 'Title', hint: 'Centered title · Bold · 20pt' },
  { format: 'blockquote', label: 'Quote', hint: 'Indented quotation' },
  { format: 'caption', label: 'Caption', hint: 'Centered italic caption' },
]

/** The look a heading format carries when no preset says otherwise. */
const DEFAULT_LOOKS: Record<string, string> = {
  h1: 'font-size:18pt; font-weight:700; margin-top:0.85em; margin-bottom:0.35em',
  h2: 'font-size:14.5pt; font-weight:700; margin-top:0.75em; margin-bottom:0.3em',
  h3: 'font-size:12.5pt; font-weight:700; margin-top:0.65em; margin-bottom:0.25em',
  title: 'font-size:20pt; font-weight:700; text-align:center; margin-top:0.75em; margin-bottom:0.35em',
}

/** CSS for a preset's heading rule (size, weight, slant, alignment). */
function presetLook(style: HeadingStyle): string {
  return [
    `font-size:${style.fontSize}`,
    `font-weight:${style.fontWeight}`,
    style.fontStyle === 'italic' ? 'font-style:italic' : '',
    `text-align:${style.textAlign}`,
    'margin-top:0.5em',
    'margin-bottom:0.4em',
  ]
    .filter(Boolean)
    .join('; ')
}

/**
 * The combined look of a format: size, weight, alignment and spacing together.
 * It is written onto the block itself, so the block keeps this look whatever
 * preset is active later. The heading level stays as a hidden structure tag
 * (outline, table of contents, numbering) and never decides how the block looks.
 */
export function combinedLook(format: string, presetKey: string | null): string {
  const preset = ACADEMIC_PRESETS.find((candidate) => candidate.key === basePresetKey(presetKey))
  if (preset) {
    if (format === 'title') return presetLook(preset.title ?? preset.headings.level1)
    if (format === 'h1') return presetLook(preset.headings.level1)
    if (format === 'h2') return presetLook(preset.headings.level2)
    if (format === 'h3') return presetLook(preset.headings.level3)
  }
  return DEFAULT_LOOKS[format] ?? ''
}

/**
 * Apply a style tile to the block at the current selection. When `from`/`to`
 * are provided the selection is moved there first (used by drag-and-drop).
 * Applied styles are tagged with `style_source: "applied_style"` so the
 * behavioral model can distinguish deliberate style choices (plan point 20).
 * The caret is restored to the styled block afterwards so applying a style
 * never kicks the cursor into the next paragraph.
 */
export function applyStyleCommand(
  editor: Editor | null,
  format: string,
  from?: number,
  to?: number,
  presetKey: string | null = null
): void {
  if (!editor || editor.isDestroyed) return

  // Remember where the user was before the command runs; block conversions
  // (e.g. paragraph → heading) must never move the caret off the block.
  const selection = editor.state.selection
  const targetFrom = typeof from === 'number' ? from : selection.from
  const targetTo = typeof to === 'number' ? to : selection.to

  const chain = editor.chain().focus()
  if (typeof from === 'number' && typeof to === 'number') {
    chain.setTextSelection({ from, to })
  }

  switch (format) {
    case 'normal':
      chain
        .setParagraph()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      break
    case 'h1':
      chain
        .setHeading({ level: 1 })
        .updateAttributes('', { styleSource: 'applied_style', style: combinedLook('h1', presetKey), docRole: null })
        .run()
      break
    case 'h2':
      chain
        .setHeading({ level: 2 })
        .updateAttributes('', { styleSource: 'applied_style', style: combinedLook('h2', presetKey), docRole: null })
        .run()
      break
    case 'h3':
      chain
        .setHeading({ level: 3 })
        .updateAttributes('', { styleSource: 'applied_style', style: combinedLook('h3', presetKey), docRole: null })
        .run()
      break
    case 'title':
      // The title's look is its own combined format; the role is a hidden tag.
      chain
        .setHeading({ level: 1 })
        .updateAttributes('', { styleSource: 'applied_style', style: combinedLook('title', presetKey), docRole: 'title' })
        .run()
      break
    case 'blockquote':
      chain
        .toggleBlockquote()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      break
    case 'caption':
      chain
        .setParagraph()
        .setTextAlign('center')
        .setFontSize('11pt')
        .toggleItalic()
        .updateAttributes('', { styleSource: 'applied_style' })
        .run()
      break
    default:
      return
  }

  // Restore the caret inside the block the user just styled.
  const docSize = editor.state.doc.content.size
  editor
    .chain()
    .setTextSelection({ from: Math.min(targetFrom, docSize), to: Math.min(targetTo, docSize) })
    .focus()
    .run()
}
