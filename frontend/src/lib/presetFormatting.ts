/**
 * "Preset governs style, ML predicts intent." A prediction (or a learned habit) says what a block
 * IS — a section heading, the title — and the document's preset says how that looks: IEEE gives a
 * level-2 heading 10pt Times italic, APA 12pt bold flush left. With a preset active, accepting a
 * structural suggestion applies the preset's look instead of a style the model or habit carried.
 *
 * When the person keeps restyling their headings anyway, that is a sign their document wants a
 * different look: after OVERRIDE_FORK_THRESHOLD overrides the editor offers to save their own
 * version of the preset (PresetForkPrompt).
 */

/** Structural roles whose look a preset defines. */
export type StructuralRole = 'title' | 'h1' | 'h2' | 'h3'

const ROLES: Record<string, StructuralRole> = {
  title: 'title',
  h1: 'h1',
  heading1: 'h1',
  h2: 'h2',
  heading2: 'h2',
  h3: 'h3',
  heading3: 'h3',
}

/** The structural role a suggested format stands for, or null (bold, lists, quotes, …). */
export function structuralRole(format: string): StructuralRole | null {
  return ROLES[format] ?? null
}

/** Ribbon actions that restyle a block's typography (what a preset sets). */
const TYPOGRAPHY_OVERRIDES = new Set([
  'bold',
  'italic',
  'underline',
  'font_size',
  'font_family',
  'font_color',
  'align_left',
  'align_center',
  'align_right',
  'align_justify',
  'indent',
  'outdent',
])

/** Manual restyles of preset headings that prompt the offer to save a personal version. */
export const OVERRIDE_FORK_THRESHOLD = 4

/** Whether a ribbon action overrides the preset's look of the block it is applied to. */
export function isTypographyOverride(action: string): boolean {
  return TYPOGRAPHY_OVERRIDES.has(action)
}
