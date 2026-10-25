import { useState } from 'react'
import { ShieldCheck, Loader2 } from 'lucide-react'
import { api, type OriginalityPassageReview, type OriginalityResult, type OriginalityReview } from '../../services/api'

/** Badge colours and wording for the AI judges' verdicts. */
const VERDICT_STYLE: Record<OriginalityPassageReview['verdict'], { label: string; color: string }> = {
  original: { label: 'Original', color: '#047857' },
  paraphrased: { label: 'Paraphrased', color: '#b45309' },
  reused: { label: 'Reused', color: '#b91c1c' },
  inconclusive: { label: 'Unclear', color: 'var(--muted-foreground)' },
}

interface OriginalityCardProps {
  documentId: string
  /** Called with the passage's text when the student clicks an overlapping passage. */
  onJump: (passageText: string) => void
}

/** Tools-tab card: compares this document with the student's own other documents. */
export default function OriginalityCard({ documentId, onJump }: OriginalityCardProps): JSX.Element {
  const [result, setResult] = useState<OriginalityResult | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<OriginalityReview | null>(null)
  const [reviewing, setReviewing] = useState<boolean>(false)

  /** Run the self-check on the server and store the result for display. */
  async function checkNow(): Promise<void> {
    setLoading(true)
    setError(null)
    setReview(null)
    try {
      setResult(await api.plagiarism.selfCheck(documentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Originality check failed')
    } finally {
      setLoading(false)
    }
  }

  /** Ask the AI judges to look at the flagged passages and explain what they found. */
  async function getReview(): Promise<void> {
    setReviewing(true)
    setError(null)
    try {
      setReview(await api.plagiarism.selfCheckReview(documentId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI review failed')
    } finally {
      setReviewing(false)
    }
  }

  return (
    <div
      style={{
        borderRadius: '0.5rem',
        overflow: 'hidden',
        boxShadow: 'var(--border-shadow) 0px 0px 0px 1px',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1rem',
          backgroundColor: 'var(--secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ShieldCheck style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} />
          <span
            style={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
            }}
          >
            Originality
          </span>
        </div>
        <button
          type="button"
          onClick={() => void checkNow()}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.25rem 0.625rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            borderRadius: '0.375rem',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--background)',
            color: 'var(--foreground)',
            cursor: loading ? 'default' : 'pointer',
          }}
        >
          {loading && <Loader2 style={{ width: '12px', height: '12px' }} className="animate-spin" />}
          {loading ? 'Checking…' : 'Check now'}
        </button>
      </div>

      <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {error && <div style={{ fontSize: '0.8125rem', color: 'var(--destructive)' }}>{error}</div>}

        {result && (
          <>
            <div style={{ fontSize: '0.875rem', color: 'var(--foreground)' }}>
              <strong>{result.overlap_percent}%</strong> overlap with your other documents
            </div>
            {result.passages.length === 0 ? (
              <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                No overlapping passages found.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {result.passages.map((passage) => (
                  <li key={`${passage.paragraph_index}-${passage.peer_document_id}`}>
                    <button
                      type="button"
                      onClick={() => onJump(passage.text)}
                      title={passage.text}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '0.375rem 0.5rem',
                        fontSize: '0.8125rem',
                        borderRadius: '0.375rem',
                        border: '1px solid var(--border)',
                        backgroundColor: 'transparent',
                        color: 'var(--foreground)',
                        cursor: 'pointer',
                      }}
                    >
                      {passage.peer_title || 'Untitled'} · {Math.round(passage.similarity)}%
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {result.passages.length > 0 && !review && (
              <button
                type="button"
                onClick={() => void getReview()}
                disabled={reviewing}
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.25rem 0.625rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                  color: 'var(--foreground)',
                  cursor: reviewing ? 'default' : 'pointer',
                }}
              >
                {reviewing && <Loader2 style={{ width: '12px', height: '12px' }} className="animate-spin" />}
                {reviewing ? 'Asking the AI judges…' : 'Get AI review'}
              </button>
            )}
            {review && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase' }}>
                  AI review
                </div>
                {review.reviews.length === 0 && (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                    The judges could not review these passages right now. Try again in a moment.
                  </div>
                )}
                {review.reviews.map((item) => {
                  const style = VERDICT_STYLE[item.verdict]
                  return (
                    <div
                      key={`${item.paragraph_index}-${item.peer_document_id}`}
                      style={{ border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.5rem' }}
                    >
                      <button
                        type="button"
                        onClick={() => onJump(item.text)}
                        title={item.text}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--foreground)', fontSize: '0.8125rem' }}
                      >
                        <span style={{ fontWeight: 700, color: style.color }}>{style.label}</span>
                        {' · '}
                        {item.peer_title || 'Untitled'} · {Math.round(item.similarity)}%
                      </button>
                      {item.reasoning && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>{item.reasoning}</div>
                      )}
                      {item.judges.length > 0 && (
                        <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                          Judged by {Array.from(new Set(item.judges.map((j) => j.model || j.provider).filter(Boolean))).join(', ')}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)' }}>
          Compares only against your own documents, not the internet.
        </div>
      </div>
    </div>
  )
}
