import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import katex from 'katex'
import { Check, Trash2, X } from 'lucide-react'
import { nextEquationNumber, type MathEditRequest } from './MathNodes'

interface MathEditPopoverProps {
  editor: Editor | null
}

const WIDTH = 380
const OFFSET = 10

/** Place the card under the equation, or above it when there is no room below. */
function place(rect: DOMRect): { top: number; left: number } {
  const left = Math.min(Math.max(rect.left + rect.width / 2 - WIDTH / 2, 8), window.innerWidth - WIDTH - 8)
  const below = window.innerHeight - rect.bottom
  return { left, top: below > 300 ? rect.bottom + OFFSET : Math.max(rect.top - 290, 8) }
}

/**
 * Edit one equation: its LaTeX, with a live preview, and the number of a display equation.
 * Opens when an equation is clicked or inserted (the editor's `math-edit` event) and changes the
 * document only on Apply.
 */
export function MathEditPopover({ editor }: MathEditPopoverProps): JSX.Element | null {
  const [request, setRequest] = useState<MathEditRequest | null>(null)
  const [latex, setLatex] = useState('')
  const [number, setNumber] = useState('')
  const [position, setPosition] = useState({ top: 8, left: 8 })
  const preview = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!editor) return
    const open = (next: MathEditRequest): void => {
      setRequest(next)
      setLatex(next.latex)
      setNumber(next.number ?? '')
    }
    editor.on('math-edit', open)
    return () => {
      editor.off('math-edit', open)
    }
  }, [editor])

  useLayoutEffect(() => {
    if (!request) return
    setPosition(place(request.rect))
    field.current?.focus()
    field.current?.select()
  }, [request])

  // The preview is KaTeX's own output for what is typed; a mistake shows the error instead of nothing.
  useEffect(() => {
    if (!request || !preview.current) return
    try {
      katex.render(latex || '\\;', preview.current, { displayMode: request.kind === 'block', throwOnError: true })
      preview.current.dataset.error = ''
    } catch (error) {
      preview.current.textContent = error instanceof Error ? error.message.replace(/^KaTeX parse error: /, '') : 'Cannot draw this'
      preview.current.dataset.error = 'true'
    }
  }, [latex, request])

  const close = (): void => setRequest(null)

  const apply = (): void => {
    if (!editor || !request) return
    const trimmed = latex.trim()
    const cleanNumber = number.trim()
    const type = request.kind === 'inline' ? 'inlineMath' : 'blockMath'
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(request.pos)
        if (!node || node.type.name !== type) return false
        if (trimmed === '') {
          tr.delete(request.pos, request.pos + node.nodeSize)
          return true
        }
        tr.setNodeMarkup(request.pos, undefined, {
          ...node.attrs,
          latex: trimmed,
          ...(request.kind === 'block' ? { number: cleanNumber === '' ? null : cleanNumber } : {}),
        })
        return true
      })
      .run()
    close()
  }

  const remove = (): void => {
    if (!editor || !request) return
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(request.pos)
        if (!node) return false
        tr.delete(request.pos, request.pos + node.nodeSize)
        return true
      })
      .run()
    close()
  }

  if (!request) return null

  return (
    <div
      role="dialog"
      aria-label="Edit equation"
      onKeyDown={(event) => {
        if (event.key === 'Escape') close()
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) apply()
      }}
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 60,
        width: WIDTH,
        maxWidth: 'calc(100vw - 1rem)',
        backgroundColor: 'var(--card)',
        borderRadius: '0.75rem',
        boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.12) 0px 8px 24px',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)', flex: 1 }}>
          {request.kind === 'block' ? 'Equation' : 'Equation in a line of text'}
        </span>
        <button type="button" onClick={close} title="Close" style={{ border: 'none', background: 'transparent', color: 'var(--muted-foreground)', cursor: 'pointer', display: 'flex' }}>
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        <label style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
          LaTeX
          <textarea
            ref={field}
            value={latex}
            onChange={(event) => setLatex(event.target.value)}
            rows={3}
            spellCheck={false}
            style={{ width: '100%', marginTop: 4, padding: '0.5rem', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem', border: '1px solid var(--border)', borderRadius: '0.5rem', background: 'var(--background)', color: 'var(--foreground)', resize: 'vertical' }}
          />
        </label>

        <div
          ref={preview}
          aria-live="polite"
          style={{ minHeight: 48, padding: '0.5rem', border: '1px dashed var(--border)', borderRadius: '0.5rem', overflowX: 'auto', textAlign: 'center' }}
        />

        {request.kind === 'block' && (
          <label style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Number
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              placeholder="none"
              style={{ width: 80, padding: '0.25rem 0.5rem', border: '1px solid var(--border)', borderRadius: '0.375rem', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button type="button" onClick={() => editor && setNumber(nextEquationNumber(editor))} style={{ border: 'none', background: 'transparent', color: 'var(--accent-strong, #1351aa)', cursor: 'pointer', fontSize: '0.75rem' }}>
              Use next number
            </button>
          </label>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          <button type="button" onClick={remove} style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--error, #c0453f)', cursor: 'pointer', fontSize: '0.8125rem' }}>
            <Trash2 style={{ width: 14, height: 14 }} /> Remove
          </button>
          <button type="button" onClick={apply} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.375rem 0.75rem', border: 'none', borderRadius: '0.5rem', background: 'var(--accent-strong, #1351aa)', color: '#fff', cursor: 'pointer', fontSize: '0.8125rem' }}>
            <Check style={{ width: 14, height: 14 }} /> Apply
          </button>
        </div>
      </div>
    </div>
  )
}
