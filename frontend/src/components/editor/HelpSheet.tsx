import { useEffect } from 'react'
import { X } from 'lucide-react'

interface HelpSheetProps {
  open: boolean
  onClose: () => void
}

interface HelpGroup {
  title: string
  rows: Array<[string, string]>
}

const GROUPS: HelpGroup[] = [
  {
    title: 'Keyboard shortcuts',
    rows: [
      ['Ctrl + Enter', 'Apply the suggestion that is open'],
      ['Esc', 'Dismiss the open suggestion'],
      ['Alt + ↑ / ↓', 'Change the suggested format'],
      ['Ctrl + \\', 'Show or hide the side panel'],
      ['Ctrl + Shift + \\', 'Show or hide the outline'],
      ['Ctrl + K', 'Open the command menu'],
    ],
  },
  {
    title: 'Type / for quick commands',
    rows: [
      ['/heading', 'Turn the line into a heading'],
      ['/table', 'Insert a table'],
      ['/page', 'Start a new page'],
      ['/help', 'Open this help'],
    ],
  },
  {
    title: 'Ask the assistant',
    rows: [
      ['Make the title bold and centered', 'Shows a preview first; nothing changes until you press Apply'],
      ['Change the "approval sheet" to italic', 'Quotes mean only those words; without quotes it means the whole section'],
      ['Make all the chapter headings 14pt', 'Works on every chapter heading at once'],
      ['What does Chapter 3 say about the research design?', 'Answers from your document and shows which section it used'],
      ['undo that', 'Takes back the last change made from the chat'],
    ],
  },
  {
    title: 'How suggestions work',
    rows: [
      ['Suggestions tab', 'Pick any item to jump to it, then accept or dismiss it in the document'],
      ['Before / After', 'The popup shows the suggested look on the page before you accept'],
      ['Turn off', 'Use the switches at the top of the Suggestions tab, or Preset overlays in Tools'],
      ['Auto-save', 'Your work saves as you type; unsaved changes are offered back if the connection drops'],
    ],
  },
]

/** A short guide to the editor's commands, shortcuts and suggestion tools. */
export default function HelpSheet({ open, onClose }: HelpSheetProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Help"
        onClick={(event) => event.stopPropagation()}
        style={{ width: 'min(40rem, 100%)', maxHeight: '85vh', overflowY: 'auto', borderRadius: '0.875rem', border: '1px solid var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)', boxShadow: '0 20px 48px rgba(0,0,0,0.25)' }}
      >
        <div style={{ position: 'sticky', top: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--card)' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Help</h2>
          <button type="button" onClick={onClose} aria-label="Close help" className="panel-icon-btn">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div style={{ padding: '1rem 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 style={{ margin: '0 0 0.5rem', fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                {group.title}
              </h3>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 14rem) 1fr', gap: '0.5rem 1rem' }}>
                {group.rows.map(([term, description]) => (
                  <div key={term} style={{ display: 'contents' }}>
                    <dt style={{ fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-word' }}>{term}</dt>
                    <dd style={{ margin: 0, fontSize: '0.8125rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>{description}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
