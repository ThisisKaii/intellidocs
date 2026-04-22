import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react'
import { api } from '@/services/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  command_applied?: string | null
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
}

/** Floating AI chatbot for natural language document help. */
export default function AIChatbot({
  documentId,
  documentTitle,
  documentContent,
  onFormatApplied: _onFormatApplied,
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
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        history
      )

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.reply,
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
