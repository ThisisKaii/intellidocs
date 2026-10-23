import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

/** How an image sits relative to the text column. */
export type ImageAlignment = 'left' | 'center' | 'right' | 'float'

/** How a table sits relative to the text column. */
export type TableAlignment = 'left' | 'center' | 'right'

export interface BehaviorEventPayload {
  text?: string
  format?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number | null
  textAlign?: string
  /** Shape of the table at the moment of the action. */
  tableRows?: number
  tableCols?: number
  tableAlignment?: TableAlignment
  tableHasHeader?: boolean
  /** Image dimensions in CSS pixels, captured on insert and on resize. */
  imageWidth?: number
  imageHeight?: number
  imageAlignment?: ImageAlignment
  imageHasCaption?: boolean
  /** Callout variant, blockquote depth, or code-block language. */
  blockType?: string
  blockIndent?: number
  codeLanguage?: string
  /** Node type the action happened inside, e.g. 'table' or 'image'. */
  contextNode?: string
}

export interface BehaviorEvent {
  action: string
  timestamp: string
  documentId: string
  blockId?: string
  payload?: BehaviorEventPayload
}

export function createBehaviorEvent(
  action: string,
  documentId: string,
  blockId?: string,
  payload?: BehaviorEventPayload
): BehaviorEvent {
  return {
    action,
    timestamp: new Date().toISOString(),
    documentId,
    blockId,
    payload,
  }
}

export interface TableShape {
  tableRows: number
  tableCols: number
}

/** Academic table style presets. */
export type AcademicTableStyle =
  | 'apa-three-line'
  | 'ieee-grid'
  | 'shaded-header'
  | 'borderless'
  | 'minimal'

/** Text-wrapping modes for academic images. */
export type ImageWrapMode =
  | 'inline'
  | 'square'
  | 'tight'
  | 'behind'
  | 'in-front'
  | 'top-bottom'
  | 'none'

/** Table context captured when a table action fires. */
export interface TableContext extends TableShape {
  tableHasHeader: boolean
  tableAlignment: TableAlignment
  tableStylePreset?: AcademicTableStyle
  tableHasHeaderRow?: boolean
  tableHasHeaderColumn?: boolean
  tableNumber?: string | number | null
}

/** Image context captured when an image action fires. */
export interface ImageContext {
  imageWidth?: number
  imageHeight?: number
  imageAlignment: ImageAlignment
  imageHasCaption: boolean
  imageWrapMode?: ImageWrapMode
  figureNumber?: string | number | null
}

/**
 * Walk up from the selection to the nearest node of the given type.
 * Returns undefined when the cursor is not inside such a node.
 */
function findAncestor(editor: Editor, typeName: string): ProseMirrorNode | undefined {
  if (!editor || editor.isDestroyed) return undefined
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === typeName) return node
  }
  return undefined
}

/**
 * Measure the table that contains the current selection.
 * Returns undefined when the cursor is not inside a table.
 */
export function snapshotTableShape(editor: Editor): TableShape | undefined {
  const node = findAncestor(editor, 'table')
  if (!node) return undefined
  const firstRow = node.firstChild
  return {
    tableRows: node.childCount,
    tableCols: firstRow ? firstRow.childCount : 0,
  }
}

/**
 * Capture the full table context — shape, header state, and alignment — for
 * behavior tracking. Returns undefined when the cursor is not inside a table.
 */
export function snapshotTableContext(editor: Editor): TableContext | undefined {
  const node = findAncestor(editor, 'table')
  if (!node) return undefined
  const firstRow = node.firstChild
  const rawAlignment = node.attrs.alignment
  const alignment: TableAlignment =
    rawAlignment === 'left' || rawAlignment === 'right' || rawAlignment === 'center'
      ? rawAlignment
      : 'center'
  return {
    tableRows: node.childCount,
    tableCols: firstRow ? firstRow.childCount : 0,
    tableHasHeader: firstRow?.type.name === 'tableHeader',
    tableAlignment: alignment,
    tableStylePreset: node.attrs.stylePreset as AcademicTableStyle | undefined,
    tableHasHeaderRow: node.attrs.hasHeaderRow,
    tableHasHeaderColumn: node.attrs.hasHeaderColumn,
    tableNumber: node.attrs.tableNumber,
  }
}

/**
 * Read a pixel length out of an inline style string.
 * Used to recover image dimensions that the resize extension stores in
 * containerStyle rather than as a numeric attribute.
 */
function readPixels(style: unknown, property: string): number | undefined {
  if (typeof style !== 'string') return undefined
  const match = style.match(new RegExp(`${property}\\s*:\\s*([\\d.]+)px`))
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

/** A resolved image node together with its position in the document. */
export interface ResolvedImage {
  node: ProseMirrorNode
  pos: number
}

/** True for the editor's image node (`imageResize`) and the stock `image` node. */
function isImageNode(node: { type: { name: string } }): boolean {
  return node.type.name === 'image' || node.type.name === 'imageResize'
}

/**
 * Find the image the selection points at: a NodeSelection on the image, or any
 * image inside the selected range. Handles top-level images, which a plain
 * ancestor walk misses because their depth is 0.
 */
export function resolveImage(editor: Editor): ResolvedImage | undefined {
  if (!editor || editor.isDestroyed) return undefined
  const { selection } = editor.state
  if (selection instanceof NodeSelection && isImageNode(selection.node)) {
    return { node: selection.node, pos: selection.from }
  }
  const { from, to } = selection
  let hit: ResolvedImage | undefined
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (!hit && isImageNode(node)) hit = { node, pos }
  })
  return hit
}

/**
 * Capture the image under the selection — size, alignment, and whether it
 * already carries a caption. Returns undefined when no image is selected.
 */
export function snapshotImageContext(editor: Editor): ImageContext | undefined {
  const resolved = resolveImage(editor)
  if (!resolved) return undefined
  const node = resolved.node

  const rawAlignment = node.attrs.alignment
  const alignment: ImageAlignment =
    rawAlignment === 'left' || rawAlignment === 'right' || rawAlignment === 'float'
      ? rawAlignment
      : 'center'

  const containerStyle = node.attrs.containerStyle
  const width =
    typeof node.attrs.width === 'number' ? node.attrs.width : readPixels(containerStyle, 'width')
  const height =
    typeof node.attrs.height === 'number' ? node.attrs.height : readPixels(containerStyle, 'height')

  return {
    imageWidth: width,
    imageHeight: height,
    imageAlignment: alignment,
    imageHasCaption: Boolean(node.attrs.caption),
    imageWrapMode: node.attrs.wrapMode as ImageWrapMode | undefined,
    figureNumber: node.attrs.figureNumber,
  }
}
