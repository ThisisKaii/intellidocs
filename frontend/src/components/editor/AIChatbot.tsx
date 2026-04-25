import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react'
import { api, type RejectedFormattingPreview } from '@/services/api'
import * as FormattingCommands from './FormattingCommands'
import { restoreSelection } from './SelectionManager'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  command_applied?: string | null
  preview_format?: string | null
  preview_reason?: string | null
  preview_status?: 'pending' | 'applied' | 'rejected' | null
}

interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatbotProps {
  documentId: string | undefined
  documentTitle?: string
  documentContent: string
  onFormatApplied?: (format: string) => void
  onFocusEditor?: () => void
}

/** Floating AI chatbot for natural language document help. */
export default function AIChatbot({
  documentId,
  documentTitle,
  documentContent,
  onFormatApplied,
  onFocusEditor,
}: AIChatbotProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I’m your IntelliDocs AI assistant. I can help you think through formatting, wording, and document edits. I won’t auto-apply changes yet, but I can guide you based on your current document.',
    },
  ])
  const [input, setInput] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [rejectedPreviews, setRejectedPreviews] = useState<RejectedFormattingPreview[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /** Format a machine-readable format key into a user-facing label. */
  function formatPreviewLabel(format: string): string {
    const labels: Record<string, string> = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      heading1: 'Heading 1',
      heading2: 'Heading 2',
      heading3: 'Heading 3',
      h1: 'Heading 1',
      h2: 'Heading 2',
      h3: 'Heading 3',
      blockquote: 'Blockquote',
      unordered_list: 'Bullet List',
      ordered_list: 'Numbered List',
      ul: 'Bullet List',
      ol: 'Numbered List',
    }

    return labels[format] ?? format
  }

  /** Return true when a format was already rejected in this chat session. */
  function hasRejectedPreview(format: string): boolean {
    return rejectedPreviews.some((preview) => preview.format === format)
  }

  /** Apply a confirmed formatting preview to the current editor selection. */
  function handlePreviewApply(messageIndex: number, format: string): void {
    const commands: Record<string, (() => void) | undefined> = {
      bold: FormattingCommands.bold,
      italic: FormattingCommands.italic,
      underline: FormattingCommands.underline,
      heading1: FormattingCommands.heading1,
      heading2: FormattingCommands.heading2,
      heading3: FormattingCommands.heading3,
      blockquote: FormattingCommands.blockquote,
      unordered_list: FormattingCommands.bulletList,
      ordered_list: FormattingCommands.numberedList,
    }

    const command = commands[format]
    if (!command) return

    onFocusEditor?.()
    restoreSelection()
    command()
    onFormatApplied?.(format)

    if (documentId) {
      api.behavior
        .log({
          action: `chat_preview_accepted:${format}`,
          timestamp: new Date().toISOString(),
          documentId,
        })
        .catch((error) => console.error('Chat preview acceptance log failed', error))
    }

    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? {
              ...message,
              preview_status: 'applied',
              command_applied: formatPreviewLabel(format),
            }
          : message
      )
    )
  }

  /** Reject a formatting preview without changing the document. */
  function handlePreviewReject(
    messageIndex: number,
    format: string,
    reason?: string | null
  ): void {
    const rejectedPreview: RejectedFormattingPreview = {
      format,
      reason: reason ?? 'User rejected the preview suggestion.',
      rejectedAt: new Date().toISOString(),
    }

    setRejectedPreviews((current) => {
      if (current.some((preview) => preview.format === format)) {
        return current
      }

      return [...current, rejectedPreview]
    })

    if (documentId) {
      api.behavior
        .log({
          action: `chat_preview_rejected:${format}`,
          timestamp: rejectedPreview.rejectedAt ?? new Date().toISOString(),
          documentId,
        })
        .catch((error) => console.error('Chat preview rejection log failed', error))
    }

    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? {
              ...message,
              preview_status: 'rejected',
            }
          : message
      )
    )
  }

  /** Send a message to the backend AI chat endpoint. */
  async function send(): Promise<void> {
    if (!input.trim() || loading) return

    const userMsg = input.trim()
    setInput('')
    setMessages((current) => [...current, { role: 'user', content: userMsg }])
    setLoading(true)

    try {
      const history: ChatHistoryEntry[] = messages
        .filter((message) => !message.command_applied)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }))
        .slice(-6)

      const response = await api.ai.chat(
        userMsg,
        documentId,
        documentTitle,
        documentContent,
        history,
        rejectedPreviews
      )

      const previewFormat =
        response.preview && typeof response.preview.format === 'string'
          ? response.preview.format
          : null
      const previewWasRejected =
        previewFormat !== null && hasRejectedPreview(previewFormat)
      const basePreviewReason =
        response.preview && typeof response.preview.reason === 'string'
          ? response.preview.reason
          : null
      const reconfirmationNote =
        previewWasRejected && previewFormat
          ? `\n\nYou previously rejected ${formatPreviewLabel(previewFormat)} in this chat. I’m showing it again because you asked for it; confirm only if you want to apply it now.`
          : ''
      const previewReason =
        previewWasRejected && previewFormat
          ? `${basePreviewReason ?? 'Detected a repeated formatting request.'} Previously rejected in this chat; confirm again before applying.`
          : basePreviewReason

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: `${response.reply}${reconfirmationNote}`,
        preview_format: previewFormat,
        preview_reason: previewFormat ? previewReason : null,
        preview_status: previewFormat ? 'pending' : null,
      }

      setMessages((current) => [...current, assistantMsg])
    } catch (error) {
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content:
          error instanceof Error
            ? `I couldn't reach the AI service: ${error.message}`
            : 'I couldn’t reach the AI service right now.',
      }

      setMessages((current) => [...current, assistantMsg])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary)',
          color: 'var(--primary-foreground)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 14px 0 rgba(0,0,0,0.1)',
          border: 'none',
          cursor: 'pointer',
          transition: 'opacity 150ms transform 150ms',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
        title="AI Assistant"
      >
        {open ? <X style={{ width: '16px', height: '16px' }} /> : <MessageSquare style={{ width: '16px', height: '16px' }} />}
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              bottom: '56px',
              right: 0,
              width: '320px',
              backgroundColor: 'var(--card)',
              boxShadow: 'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px, inset 0px 0px 0px 1px var(--card-shadow-inner)',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'var(--secondary)' }}>
              <div style={{ width: '24px', height: '24px', backgroundColor: 'var(--primary)', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles style={{ width: '12px', height: '12px', color: 'var(--primary-foreground)' }} />
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 600, margin: 0, color: 'var(--foreground)' }}>AI Assistant</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>Document-aware writing help</p>
              </div>
            </div>

            {/* Messages */}
            <div style={{ height: '256px', overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '85%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      lineHeight: 1.5,
                      backgroundColor: m.role === 'user' ? 'var(--primary)' : 'var(--secondary)',
                      color: m.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    {m.content}
                    {m.preview_format && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem 0.625rem',
                          borderRadius: '0.5rem',
                          backgroundColor: 'rgba(59, 130, 246, 0.08)',
                          border: '1px solid rgba(59, 130, 246, 0.16)',
                          color: m.role === 'user' ? 'var(--primary-foreground)' : 'var(--foreground)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            opacity: 0.75,
                            marginBottom: '0.25rem',
                          }}
                        >
                          Preview suggestion
                        </div>
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            marginBottom: m.preview_reason ? '0.25rem' : 0,
                          }}
                        >
                          {formatPreviewLabel(m.preview_format)}
                        </div>
                        {m.preview_reason && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              lineHeight: 1.45,
                              opacity: 0.8,
                            }}
                          >
                            {m.preview_reason}
                          </div>
                        )}

                        {m.preview_status === 'pending' && (
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
                            <button
                              type="button"
                              onClick={() => handlePreviewApply(i, m.preview_format as string)}
                              style={{
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
                              }}
                            >
                              Apply
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePreviewReject(i, m.preview_format as string, m.preview_reason)}
                              style={{
                                flex: 1,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                padding: '0.375rem 0.5rem',
                                borderRadius: '0.375rem',
                                border: '1px solid var(--border)',
                                backgroundColor: 'transparent',
                                color: 'var(--muted-foreground)',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              Reject
                            </button>
                          </div>
                        )}

                        {m.preview_status === 'rejected' && (
                          <div
                            style={{
                              marginTop: '0.5rem',
                              fontSize: '0.75rem',
                              color: 'var(--muted-foreground)',
                            }}
                          >
                            Rejected
                          </div>
                        )}
                      </div>
                    )}
                    {m.command_applied && (
                      <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ color: '#10b981' }}>✓</span> Applied: {m.command_applied}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ backgroundColor: 'var(--secondary)', padding: '0.5rem 0.75rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
                    <Loader2 style={{ width: '16px', height: '16px', color: 'var(--muted-foreground)' }} className="animate-spin" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="Ask for writing or formatting help..."
                style={{
                  flex: 1,
                  fontSize: '0.875rem',
                  backgroundColor: 'var(--secondary)',
                  borderRadius: '0.375rem',
                  padding: '0.5rem 0.75rem',
                  outline: 'none',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'inherit',
                  transition: 'box-shadow 150ms',
                }}
                onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.boxShadow = '0 0 0 2px rgba(0, 112, 243, 0.4)' }}
                onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.boxShadow = 'none' }}
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || loading}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                  opacity: !input.trim() || loading ? 0.5 : 1,
                  transition: 'opacity 150ms',
                }}
                onMouseEnter={(e) => { if (input.trim() && !loading) (e.currentTarget as HTMLButtonElement).style.opacity = '0.9' }}
                onMouseLeave={(e) => { if (input.trim() && !loading) (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
              >
                <Send style={{ width: '14px', height: '14px' }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
