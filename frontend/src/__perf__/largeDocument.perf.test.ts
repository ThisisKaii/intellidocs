/**
 * Large-document benchmark (not part of the normal suite): LARGE_DOC_BENCH=1 npx vitest run src/__perf__
 *
 * Loads the V2 thesis repeated to ~220 and ~1000 pages into the editor with its real extensions and
 * times what a user waits on: opening the document, one keystroke (every plugin that runs after a
 * transaction), serialising for autosave, and one pass of the formatting scanner's checks.
 */
import { describe, it } from 'vitest'
import { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { resolve } from 'node:path'

import { editorExtensions } from '@/components/editor/TiptapEditor'
import { findBodyDeviations, findListItemDeviations } from '@/lib/bodyConsistency'
import { findShortLineDeviations } from '@/lib/shortLineConsistency'
import { findExtraBlankLines } from '@/lib/blankLines'
import { findFigureIssues } from '@/lib/figurePlacement'
import { presetRulesFor } from '@/lib/presetRules'
import { sectionIndex } from '@/hooks/useAutoFormatScanner'
import { findCaptions } from '@/components/editor/captionNumbering'

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const SOURCE = process.env.LARGE_DOC_SOURCE ?? 'V2 INTELLIDOCS (2).docx'
const html = gunzipSync(readFileSync(resolve(__dirname, `../../../tests/fixtures/import_baselines/editor_json/${SOURCE}.html.gz`))).toString('utf-8')

function time<T>(run: () => T): { ms: number; value: T } {
  const start = performance.now()
  const value = run()
  return { ms: Math.round((performance.now() - start) * 10) / 10, value }
}

const enabled = process.env.LARGE_DOC_BENCH === '1'

describe.skipIf(!enabled)('large document', () => {
  for (const copies of (process.env.LARGE_DOC_COPIES ?? '1,7,32').split(',').map(Number)) {
    it(`${copies} copies (~${copies * 31} pages)`, { timeout: 600000 }, () => {
      const content = Array.from({ length: copies }, () => html).join('')
      const open = time(() => new Editor({ extensions: editorExtensions, content }))
      const editor = open.value
      const doc = editor.state.doc
      const middle = Math.floor(doc.content.size / 2)
      // A caret inside a paragraph near the middle.
      let caret = middle
      doc.nodesBetween(middle, doc.content.size, (node, pos) => {
        if (caret !== middle) return false
        if (node.isTextblock && node.textContent.length > 20) caret = pos + 5
        return !node.isTextblock
      })
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, caret)))

      // Time each plugin's share of a keystroke: state fields, appendTransaction and view updates.
      const perPlugin = new Map<string, number>()
      const add = (name: string, ms: number): void => {
        perPlugin.set(name, (perPlugin.get(name) ?? 0) + ms)
      }
      const wrap = <F extends (...args: never[]) => unknown>(name: string, fn: F): F =>
        ((...args: Parameters<F>) => {
          const start = performance.now()
          try {
            return fn(...args)
          } finally {
            add(name, performance.now() - start)
          }
        }) as F
      const keyOf = (plugin: unknown): string => {
        const own = plugin as { key?: string; spec: { key?: { key?: string } } }
        return String(own.spec.key?.key ?? own.key ?? 'plugin')
      }
      if (process.env.LARGE_DOC_PROFILE === '1') {
        for (const plugin of editor.state.plugins) {
          const spec = plugin.spec as { appendTransaction?: (...args: never[]) => unknown }
          if (spec.appendTransaction) spec.appendTransaction = wrap(`${keyOf(plugin)}:append`, spec.appendTransaction)
        }
        const fields = (editor.state as unknown as { config: { fields: Array<{ name: string; apply: (...args: never[]) => unknown }> } }).config.fields
        for (const field of fields) field.apply = wrap(`${field.name}:state`, field.apply)
        const views = (editor.view as unknown as { pluginViews: Array<{ update?: (...args: never[]) => unknown }> }).pluginViews
        views.forEach((view, index) => {
          if (view.update) view.update = wrap(`view#${index}:${(view as { constructor: { name: string } }).constructor.name}`, view.update.bind(view))
        })
        const props = editor.view as unknown as { updateState: (...args: never[]) => unknown }
        props.updateState = wrap('view.updateState(total)', props.updateState.bind(editor.view))
      }

      const keys: number[] = []
      for (let i = 0; i < 40; i += 1) keys.push(time(() => editor.view.dispatch(editor.state.tr.insertText('a'))).ms)
      keys.sort((a, b) => a - b)
      if (perPlugin.size > 0) {
        const top = [...perPlugin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, ms]) => `${name}=${(ms / 40).toFixed(2)}`)
        console.log(`PROFILE ${copies}: ${top.join('  ')}`)
      }

      const htmlOut = time(() => editor.getHTML())
      const jsonOut = time(() => editor.getJSON())
      // Saved documents open from their JSON copy (loadEditorContent), not the HTML.
      const reopened = new Editor({ extensions: editorExtensions, content: '' })
      const json = jsonOut.value
      const openJson = time(() => reopened.commands.setContent(json, { emitUpdate: false }))
      reopened.destroy()
      const rules = presetRulesFor('uclm_capstone')
      const d = editor.state.doc
      const scan = {
        body: time(() => findBodyDeviations(d, rules?.body ?? null)).ms,
        lists: time(() => findListItemDeviations(d)).ms,
        lines: time(() => findShortLineDeviations(d, rules?.lines ?? null, { titlePageAlign: 'center', frontLabelAlign: 'center' })).ms,
        blanks: time(() => findExtraBlankLines(d, () => false)).ms,
        figures: time(() => findFigureIssues(d)).ms,
        sections: time(() => sectionIndex(d)).ms,
        captions: time(() => findCaptions(d)).ms,
      }
      console.log(
        JSON.stringify({
          copies,
          blocks: d.childCount,
          sizeKb: Math.round(content.length / 1024),
          openMs: open.ms,
          openFromJsonMs: openJson.ms,
          keystrokeMedianMs: keys[Math.floor(keys.length / 2)],
          keystrokeP90Ms: keys[Math.floor(keys.length * 0.9)],
          getHtmlMs: htmlOut.ms,
          getJsonMs: jsonOut.ms,
          scanMs: scan,
        }),
      )
      editor.destroy()
    })
  }
})
