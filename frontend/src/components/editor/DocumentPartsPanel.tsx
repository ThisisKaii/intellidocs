import { useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ListTree, Image as ImageIcon, Table2, RefreshCw } from 'lucide-react'
import { buildAutoNodes, insertOrUpdateGenerated, type GeneratedKind } from './DocumentParts'

interface DocumentPartsPanelProps {
  editor: Editor | null
  readOnly?: boolean
}

type AutoKind = Extract<GeneratedKind, 'toc' | 'lof' | 'lot'>

const PARTS: Array<{ kind: AutoKind; label: string; hint: string; icon: JSX.Element }> = [
  { kind: 'toc', label: 'Table of contents', hint: 'From your headings and chapter titles', icon: <ListTree style={{ width: 14, height: 14 }} /> },
  { kind: 'lof', label: 'List of figures', hint: 'From captions that start with “Figure n”', icon: <ImageIcon style={{ width: 14, height: 14 }} /> },
  { kind: 'lot', label: 'List of tables', hint: 'From captions that start with “Table n”', icon: <Table2 style={{ width: 14, height: 14 }} /> },
]

/** Tools card that inserts or refreshes the table of contents and the lists of figures and tables. */
export default function DocumentPartsPanel({ editor, readOnly = false }: DocumentPartsPanelProps): JSX.Element {
  const [message, setMessage] = useState<string | null>(null)

  /** Build the block from the live document, then rebuild once more so page numbers settle after reflow. */
  function run(kind: AutoKind): void {
    if (!editor || editor.isDestroyed || !editor.isEditable) return
    const updated = insertOrUpdateGenerated(editor, kind, buildAutoNodes(editor, kind))
    setMessage(updated ? 'Updated.' : 'Inserted below your cursor.')
    window.setTimeout(() => {
      if (editor.isDestroyed) return
      insertOrUpdateGenerated(editor, kind, buildAutoNodes(editor, kind))
    }, 700)
  }

  return (
    <div style={{ borderRadius: '0.5rem', border: '1px solid var(--border)', padding: '0.75rem' }}>
      <p style={{ margin: '0 0 0.5rem', fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
        Document parts
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {PARTS.map((part) => (
          <button
            key={part.kind}
            type="button"
            disabled={readOnly || !editor}
            onClick={() => run(part.kind)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              width: '100%',
              padding: '0.5rem 0.625rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              textAlign: 'left',
              cursor: readOnly ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {part.icon}
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600 }}>{part.label}</span>
              <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>{part.hint}</span>
            </span>
            <RefreshCw style={{ width: 13, height: 13, color: 'var(--muted-foreground)' }} />
          </button>
        ))}
      </div>
      <p style={{ margin: '0.5rem 0 0', fontSize: '0.6875rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>
        {message ?? 'Press again any time to refresh. Select an image or click in a table, then use Caption to add numbered captions.'}
      </p>
    </div>
  )
}
