import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { ImageAlignment } from './behaviorListener'

/** Payload reported when an image resize finishes. */
export interface ImageResizeReport {
  width?: number
  height?: number
  alignment: ImageAlignment
}

export interface ImageResizeBehaviorOptions {
  /**
   * Called with an image's new size once a resize settles. Fired from a
   * ProseMirror transaction rather than a DOM listener, so it reports the size
   * actually committed to the document.
   */
  onResize: (report: ImageResizeReport) => void
}

/** Per-editor storage, so each editor instance gets its own handler. */
export interface ImageResizeBehaviorStorage {
  onResize: ((report: ImageResizeReport) => void) | null
}

/** Key used to mark transactions this plugin created. */
const resizePluginKey = new PluginKey('intellidocs-image-resize')

/** Read a pixel length out of an inline style string. */
function readPixels(style: unknown, property: string): number | undefined {
  if (typeof style !== 'string') return undefined
  const match = style.match(new RegExp(`${property}\\s*:\\s*([\\d.]+)px`))
  if (!match) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

/** The width an image node currently renders at, in CSS pixels. */
function widthOf(node: ProseMirrorNode): number | undefined {
  if (typeof node.attrs.width === 'number') return node.attrs.width
  return readPixels(node.attrs.containerStyle, 'width')
}

/** The height an image node currently renders at, in CSS pixels. */
function heightOf(node: ProseMirrorNode): number | undefined {
  if (typeof node.attrs.height === 'number') return node.attrs.height
  return readPixels(node.attrs.containerStyle, 'height')
}

/** Interpret an image node's alignment attribute. */
function alignmentOf(node: ProseMirrorNode): ImageAlignment {
  const raw = node.attrs.alignment
  return raw === 'left' || raw === 'right' || raw === 'float' ? raw : 'center'
}

/** Position a node so an image can be matched across document versions. */
function imagePositions(doc: ProseMirrorNode): Map<number, ProseMirrorNode> {
  const images = new Map<number, ProseMirrorNode>()
  doc.descendants((node, pos) => {
    if (node.type.name === 'image') images.set(pos, node)
  })
  return images
}

declare module '@tiptap/core' {
  interface Storage {
    imageResizeBehavior: ImageResizeBehaviorStorage
  }
}

/**
 * Report image resizes for behavior tracking.
 *
 * The resize extension commits its new width straight into `containerStyle` and
 * exposes no command or event, so this plugin diffs image nodes across
 * transactions instead of listening to pointer events. Comparing before/after
 * sizes keeps unrelated edits (typing elsewhere, resizing a table) from being
 * misreported as an image resize.
 */
export const ImageResizeBehaviorExtension = Extension.create<ImageResizeBehaviorOptions>({
  name: 'imageResizeBehavior',

  addOptions() {
    return {
      onResize: () => undefined,
    }
  },

  addStorage() {
    return {
      onResize: null,
    }
  },

  addProseMirrorPlugins() {
    // Prefer the per-instance handler assigned by the editor component; fall
    // back to the static option when none was set.
    const optionHandler = this.options.onResize
    const storage = this.storage
    const onResize = (report: ImageResizeReport): void => {
      const handler = storage.onResize ?? optionHandler
      handler(report)
    }
    // A drag emits many transactions while the pointer moves. Hold the latest
    // report and flush it once the burst stops, so one drag is one event.
    let pending: ImageResizeReport | null = null
    let flushHandle: ReturnType<typeof setTimeout> | null = null

    function flush(): void {
      if (!pending) return
      const report = pending
      pending = null
      flushHandle = null
      onResize(report)
    }

    function schedule(report: ImageResizeReport): void {
      pending = report
      if (flushHandle) clearTimeout(flushHandle)
      flushHandle = setTimeout(flush, 250)
    }

    return [
      new Plugin({
        key: resizePluginKey,
        appendTransaction(transactions, oldState, newState) {
          const edited = transactions.some(
            (transaction) => transaction.docChanged && !transaction.getMeta(resizePluginKey),
          )
          if (!edited) return null

          const before = imagePositions(oldState.doc)
          const after = imagePositions(newState.doc)
          if (after.size === 0) return null

          for (const [pos, node] of after) {
            const previous = before.get(pos)
            if (!previous) continue

            const width = widthOf(node)
            if (width === undefined) continue
            if (previous === node || widthOf(previous) === width) continue

            schedule({
              width,
              height: heightOf(node),
              alignment: alignmentOf(node),
            })
            break
          }

          // No document change of our own: the report is delivered on a timer.
          return null
        },
        onDestroy() {
          if (flushHandle) clearTimeout(flushHandle)
          pending = null
        },
      }),
    ]
  },
})
