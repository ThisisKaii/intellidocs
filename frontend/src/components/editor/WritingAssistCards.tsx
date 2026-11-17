import { useState, type CSSProperties } from 'react'
import type { AIGroundedPaper, AIStructuredSection, AIToneCategory, AIToneRefinement } from '@/services/api'

/** Lifecycle of a card that changes the document once. */
export type CardStatus = 'pending' | 'done' | 'dismissed'
/** Lifecycle of one suggested revision; 'stale' when its text was edited away. */
export type EditStatus = 'pending' | 'applied' | 'dismissed' | 'stale'

const cardStyle: CSSProperties = {
  marginTop: '0.5rem',
  padding: '0.5rem 0.625rem',
  borderRadius: '0.5rem',
  backgroundColor: 'var(--accent-subtle)',
  border: '1px solid color-mix(in srgb, var(--accent-strong) 16%, transparent)',
  color: 'var(--foreground)',
}

const eyebrowStyle: CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  opacity: 0.75,
  marginBottom: '0.25rem',
}

const primaryButton: CSSProperties = {
  flex: 1,
  fontSize: '0.75rem',
  fontWeight: 600,
  padding: '0.375rem 0.5rem',
  borderRadius: '0.375rem',
  border: 'none',
  backgroundColor: 'var(--primary)',
  color: 'var(--primary-foreground)',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const secondaryButton: CSSProperties = {
  ...primaryButton,
  border: '1px solid var(--border)',
  backgroundColor: 'transparent',
  color: 'var(--muted-foreground)',
}

const smallButton: CSSProperties = { ...primaryButton, flex: 'none', padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }
const smallSecondary: CSSProperties = { ...secondaryButton, flex: 'none', padding: '0.25rem 0.5rem', fontSize: '0.6875rem' }
const noteStyle: CSSProperties = { fontSize: '0.75rem', lineHeight: 1.45, opacity: 0.8 }
const doneStyle: CSSProperties = { marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--muted-foreground)' }

function ActionRow({ primary, onPrimary, onDismiss, disabled }: { primary: string; onPrimary: () => void; onDismiss: () => void; disabled?: boolean }): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
      <button type="button" onClick={onPrimary} disabled={disabled} style={{ ...primaryButton, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {primary}
      </button>
      <button type="button" onClick={onDismiss} style={secondaryButton}>
        Dismiss
      </button>
    </div>
  )
}

/** The user's notes organised into a section: the outline, the paragraphs, then Insert. */
export function StructureCard({
  section,
  status,
  onInsert,
  onDismiss,
}: {
  section: AIStructuredSection
  status: CardStatus
  onInsert: () => void
  onDismiss: () => void
}): JSX.Element {
  return (
    <div style={cardStyle} data-testid="structure-card">
      <div style={eyebrowStyle}>Outline of your notes</div>
      <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.75rem', lineHeight: 1.45 }}>
        {section.outline.map((move) => (
          <li key={move.name} style={{ marginBottom: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>{move.name}</span>
            <ul style={{ margin: '0.125rem 0 0', paddingLeft: '0.9rem', opacity: 0.85 }}>
              {move.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div style={{ ...eyebrowStyle, marginTop: '0.5rem' }}>Preview</div>
      <div style={{ fontSize: '0.8125rem', lineHeight: 1.5, backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.5rem 0.625rem' }}>
        {section.sectionTitle !== 'New section' && <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>{section.sectionTitle}</div>}
        {section.paragraphs.map((paragraph, index) => (
          <p key={index} style={{ margin: index === 0 ? 0 : '0.375rem 0 0', textIndent: '1.25em' }}>
            {paragraph}
          </p>
        ))}
      </div>
      {section.warnings.map((warning) => (
        <div key={warning} style={{ ...noteStyle, marginTop: '0.375rem', color: 'var(--warning, #b45309)' }}>
          {warning}
        </div>
      ))}
      <div style={{ ...noteStyle, marginTop: '0.375rem' }}>Built only from your notes. Read it through before inserting.</div>
      {status === 'pending' && <ActionRow primary="Insert into document" onPrimary={onInsert} onDismiss={onDismiss} />}
      {status === 'done' && <div style={doneStyle}>✓ Inserted at your cursor</div>}
      {status === 'dismissed' && <div style={doneStyle}>Dismissed</div>}
    </div>
  )
}

const SOURCE_LABELS: Record<AIGroundedPaper['source'], string> = { crossref: 'Crossref', semanticscholar: 'Semantic Scholar' }

function authorLine(authors: string[]): string {
  if (authors.length <= 3) return authors.join(', ')
  return `${authors.slice(0, 3).join(', ')} et al.`
}

/** Real papers to choose from; ticked ones are cited at the selection and added to the references. */
export function CitationsCard({
  papers,
  status,
  styleLabel,
  onCite,
  onDismiss,
}: {
  papers: AIGroundedPaper[]
  status: CardStatus
  styleLabel: string
  onCite: (papers: AIGroundedPaper[]) => void
  onDismiss: () => void
}): JSX.Element {
  const [chosen, setChosen] = useState<boolean[]>(() => papers.map(() => false))
  const picked = papers.filter((_, index) => chosen[index])
  return (
    <div style={cardStyle} data-testid="citations-card">
      <div style={eyebrowStyle}>Published sources</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {papers.map((paper, index) => (
          <label key={`${paper.doi ?? paper.title}-${index}`} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.75rem', lineHeight: 1.45, cursor: status === 'pending' ? 'pointer' : 'default' }}>
            <input
              type="checkbox"
              checked={chosen[index] ?? false}
              disabled={status !== 'pending'}
              onChange={(event) => setChosen((current) => current.map((value, i) => (i === index ? event.target.checked : value)))}
              style={{ marginTop: '0.2rem' }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ fontWeight: 600, display: 'block' }}>{paper.title}</span>
              <span style={{ display: 'block', opacity: 0.85 }}>
                {authorLine(paper.authors)} · {paper.year}
                {paper.venue ? ` · ${paper.venue}` : ''}
              </span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginTop: '0.125rem', fontSize: '0.6875rem', opacity: 0.75 }}>
                <span>{SOURCE_LABELS[paper.source]}</span>
                {paper.citationCount ? <span>cited by {paper.citationCount.toLocaleString()}</span> : null}
                {paper.doi ? (
                  <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
                    doi:{paper.doi}
                  </a>
                ) : null}
              </span>
              {paper.abstract && <span style={{ display: 'block', marginTop: '0.25rem', opacity: 0.8 }}>{paper.abstract}</span>}
            </span>
          </label>
        ))}
      </div>
      <div style={{ ...noteStyle, marginTop: '0.5rem' }}>
        A matching paper is not proof. Check that each one supports your claim before you cite it. Citations go in as {styleLabel} after your selection or at the cursor.
      </div>
      {status === 'pending' && (
        <ActionRow
          primary={picked.length > 0 ? `Cite ${picked.length} selected` : 'Tick sources to cite'}
          onPrimary={() => onCite(picked)}
          onDismiss={onDismiss}
          disabled={picked.length === 0}
        />
      )}
      {status === 'done' && <div style={doneStyle}>✓ Cited and added to your references</div>}
      {status === 'dismissed' && <div style={doneStyle}>Dismissed</div>}
    </div>
  )
}

const CATEGORY_LABELS: Record<AIToneCategory, string> = {
  hedging: 'Hedging',
  cohesion: 'Transition',
  conciseness: 'Conciseness',
  vocabulary: 'Vocabulary',
}

const EDIT_STATUS_NOTES: Partial<Record<EditStatus, string>> = {
  applied: '✓ Applied',
  dismissed: 'Dismissed',
  stale: 'This text has changed since; revision skipped',
}

/** Before/after revisions of the user's own sentences, each applied on its own. */
export function RefineCard({
  refinement,
  statuses,
  onApply,
  onDismiss,
  onApplyAll,
}: {
  refinement: AIToneRefinement
  statuses: EditStatus[]
  onApply: (index: number) => void
  onDismiss: (index: number) => void
  onApplyAll: () => void
}): JSX.Element {
  const pending = statuses.filter((status) => status === 'pending').length
  return (
    <div style={cardStyle} data-testid="refine-card">
      {refinement.edits.length > 0 && <div style={eyebrowStyle}>Suggested revisions</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {refinement.edits.map((edit, index) => {
          const status = statuses[index] ?? 'pending'
          return (
            <div key={index} style={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.375rem 0.5rem', fontSize: '0.75rem', lineHeight: 1.45, opacity: status === 'pending' ? 1 : 0.65 }}>
              <span style={{ display: 'inline-block', fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 0.375rem', borderRadius: '999px', border: '1px solid var(--border)', marginBottom: '0.25rem' }}>
                {CATEGORY_LABELS[edit.ruleCategory]}
              </span>
              <div>
                <span style={{ textDecoration: 'line-through', color: 'var(--destructive, #b91c1c)', backgroundColor: 'color-mix(in srgb, var(--destructive, #b91c1c) 10%, transparent)' }}>{edit.original}</span>
                {' → '}
                <span style={{ color: 'var(--success, #15803d)', backgroundColor: 'color-mix(in srgb, var(--success, #15803d) 12%, transparent)' }}>{edit.refined}</span>
              </div>
              <div style={{ ...noteStyle, marginTop: '0.125rem' }}>{edit.reason}</div>
              {status === 'pending' ? (
                <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem' }}>
                  <button type="button" onClick={() => onApply(index)} style={smallButton}>
                    Apply revision
                  </button>
                  <button type="button" onClick={() => onDismiss(index)} style={smallSecondary}>
                    Dismiss
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: '0.25rem', fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>{EDIT_STATUS_NOTES[status]}</div>
              )}
            </div>
          )
        })}
      </div>
      {refinement.notices.length > 0 && (
        <div style={{ marginTop: refinement.edits.length > 0 ? '0.5rem' : 0 }}>
          <div style={eyebrowStyle}>To check</div>
          {refinement.notices.map((notice) => (
            <div key={notice.term} style={{ ...noteStyle, marginTop: '0.125rem' }}>
              {notice.message}
            </div>
          ))}
        </div>
      )}
      {pending > 1 && (
        <div style={{ display: 'flex', marginTop: '0.5rem' }}>
          <button type="button" onClick={onApplyAll} style={primaryButton}>
            Apply all {pending}
          </button>
        </div>
      )}
    </div>
  )
}
