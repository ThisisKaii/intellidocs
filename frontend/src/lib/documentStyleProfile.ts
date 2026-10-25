import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  classifyStructuralRole,
  snapshotBlockStyle,
  styleSnapshotKey,
  type BlockStyleSnapshot,
  type StructuralRole,
} from '@/hooks/useAutoFormatScanner'

/** The style most blocks of one role share inside a single document. */
export interface RoleStyle {
  style: BlockStyleSnapshot
  /** How many blocks of the role the document has. */
  count: number
  /** Fraction of those blocks that carry the dominant style (0-1). */
  share: number
}

export type DocumentStyleProfile = Partial<Record<StructuralRole, RoleStyle>>

/** A role needs at least this many blocks, mostly alike, to count as the document's own style. */
const MIN_BLOCKS = 3
const MIN_SHARE = 0.6

/**
 * Learn how this document formats each structural role (chapter heading,
 * section heading, body...) from the document itself. A document's own habits
 * come first; what the user usually does elsewhere only fills the gaps.
 */
export function buildStyleProfile(doc: ProseMirrorNode): DocumentStyleProfile {
  const groups = new Map<StructuralRole, BlockStyleSnapshot[]>()
  let firstTextBlock = true
  doc.descendants((node) => {
    if (!node.isTextblock) return true
    const text = node.textContent.trim()
    if (!text) return false
    const role = classifyStructuralRole(text, { isFirstTextBlock: firstTextBlock })
    firstTextBlock = false
    const list = groups.get(role) ?? []
    list.push(snapshotBlockStyle(node))
    groups.set(role, list)
    return false
  })

  const profile: DocumentStyleProfile = {}
  for (const [role, snapshots] of groups) {
    const counts = new Map<string, { style: BlockStyleSnapshot; n: number }>()
    for (const style of snapshots) {
      const key = styleSnapshotKey(style)
      const entry = counts.get(key) ?? { style, n: 0 }
      entry.n += 1
      counts.set(key, entry)
    }
    let best: { style: BlockStyleSnapshot; n: number } | null = null
    for (const entry of counts.values()) if (!best || entry.n > best.n) best = entry
    if (best) profile[role] = { style: best.style, count: snapshots.length, share: best.n / snapshots.length }
  }
  return profile
}

/** True when the document has an established style for this role. */
export function isEstablished(entry: RoleStyle | undefined): entry is RoleStyle {
  return !!entry && entry.count >= MIN_BLOCKS && entry.share >= MIN_SHARE
}

/**
 * Whether a learned or predicted suggestion should stay quiet because the
 * document already decides how this block looks: the block matches the
 * document's own style for its role, or the suggestion would pull it away from
 * that style.
 */
export function documentStyleOverrides(
  profile: DocumentStyleProfile,
  doc: ProseMirrorNode,
  pos: number,
  proposed: Partial<BlockStyleSnapshot>,
): boolean {
  const $pos = doc.resolve(Math.max(0, Math.min(pos, doc.content.size)))
  const block = $pos.parent
  if (!block.isTextblock) return false
  const role = classifyStructuralRole(block.textContent.trim())
  const entry = profile[role]
  if (!isEstablished(entry)) return false
  const here = snapshotBlockStyle(block)
  if (styleSnapshotKey(here) === styleSnapshotKey(entry.style)) return true
  const wouldBecome: BlockStyleSnapshot = { ...here, ...proposed }
  return styleSnapshotKey(wouldBecome) !== styleSnapshotKey(entry.style) && entry.share >= 0.8
}
