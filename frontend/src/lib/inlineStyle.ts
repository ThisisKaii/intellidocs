/**
 * Reading and merging the inline CSS a paragraph or heading carries in its `style` attribute.
 * Imported documents keep their line spacing, first-line indent and paragraph spacing there.
 */

/** Points per CSS unit, for the length units imports and presets use. */
const PT_PER_UNIT: Record<string, number> = { pt: 1, px: 0.75, in: 72, cm: 72 / 2.54, mm: 72 / 25.4 }

/** The value of one declaration in an inline style string, or null when it is absent. */
export function readStyleDecl(style: string | null | undefined, prop: string): string | null {
  if (!style) return null
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':')
    if (colon < 1) continue
    if (decl.slice(0, colon).trim().toLowerCase() === prop) return decl.slice(colon + 1).trim()
  }
  return null
}

/** A CSS length ("0.5in", "12pt", "16px", "0") in points, or null when it cannot be read. */
export function lengthToPt(value: string | null | undefined): number | null {
  if (value == null) return null
  const match = /^(-?[\d.]+)\s*(pt|px|in|cm|mm)?$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = (match[2] ?? (amount === 0 ? 'pt' : '')).toLowerCase()
  const factor = PT_PER_UNIT[unit]
  return factor === undefined ? null : amount * factor
}

/** A unitless line-height ("2", "1.725"), or null for absent, "normal" or unit-bearing values. */
export function readLineHeight(style: string | null | undefined): number | null {
  const value = readStyleDecl(style, 'line-height')
  if (!value || !/^[\d.]+$/.test(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * Set (or, with an empty value, remove) declarations in an inline style string, keeping every
 * other declaration in place. Returns null when nothing is left.
 */
export function mergeStyleDecls(current: string | null | undefined, decls: Record<string, string>): string | null {
  const replaced = new Set(Object.keys(decls).map((prop) => prop.toLowerCase()))
  const kept: string[] = []
  for (const decl of (current ?? '').split(';')) {
    const trimmed = decl.trim()
    const colon = trimmed.indexOf(':')
    if (colon < 1) continue
    if (replaced.has(trimmed.slice(0, colon).trim().toLowerCase())) continue
    kept.push(trimmed)
  }
  for (const [prop, value] of Object.entries(decls)) {
    if (value !== '') kept.push(`${prop}: ${value}`)
  }
  return kept.length > 0 ? kept.join('; ') : null
}
