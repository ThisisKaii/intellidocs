import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react'
import { api, type RejectedFormattingPreview } from '@/services/api'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  command_applied?: string | null
  preview_format?: string | null
  preview_formats?: string[] | null
  preview_scope?: 'selection' | 'all' | null
  preview_font_size?: number | null
  preview_reason?: string | null
  preview_status?: 'pending' | 'applied' | 'rejected' | null
}

interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

interface AIChatbotProps {
  editor: Editor | null
  documentId: string | undefined
  documentTitle?: string
  documentContent: string
  onFormatApplied?: (format: string) => void
  onFeedbackLogged?: () => void
  onFocusEditor?: () => void
  /** Render embedded inside a docked panel (no floating button, panel fills parent). */
  docked?: boolean
}

/** Floating AI chatbot for natural language document help. */
export default function AIChatbot({
  editor,
  documentId,
  documentTitle,
  documentContent,
  onFormatApplied,
  onFeedbackLogged,
  onFocusEditor,
  docked = false,
}: AIChatbotProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(docked)
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

  /** Single-format commands used for selection-scope previews. */
  const SELECTION_COMMANDS: Record<string, ((ed: Editor) => void) | undefined> = {
    bold: (ed) => ed.chain().focus().toggleBold().run(),
    italic: (ed) => ed.chain().focus().toggleItalic().run(),
    underline: (ed) => ed.chain().focus().toggleUnderline().run(),
    heading1: (ed) => ed.chain().focus().toggleHeading({ level: 1 }).run(),
    heading2: (ed) => ed.chain().focus().toggleHeading({ level: 2 }).run(),
    heading3: (ed) => ed.chain().focus().toggleHeading({ level: 3 }).run(),
    blockquote: (ed) => ed.chain().focus().toggleBlockquote().run(),
    unordered_list: (ed) => ed.chain().focus().toggleBulletList().run(),
    ordered_list: (ed) => ed.chain().focus().toggleOrderedList().run(),
  }

  /** Describe a preview as one readable string, e.g. "Bold + Italic + font size 20pt". */
  function describePreview(msg: ChatMessage): string {
    const parts: string[] = []
    const formats =
      msg.preview_formats && msg.preview_formats.length > 0
        ? msg.preview_formats
        : msg.preview_format && msg.preview_format !== 'body_text'
          ? [msg.preview_format]
          : []
    for (const format of formats) parts.push(formatPreviewLabel(format))
    if (msg.preview_font_size) parts.push(`font size ${msg.preview_font_size}pt`)
    return parts.length > 0 ? parts.join(' + ') : 'Text'
  }

  /** Parse key=value arguments for MCP tool calls. */
  function parseMcpArgs(raw: string): Record<string, string> {
    const args: Record<string, string> = {}
    const parts = raw.split(/\s+/).filter(Boolean)

    for (const part of parts) {
      const [key, ...rest] = part.split('=')
      if (!key || rest.length === 0) continue
      args[key] = rest.join('=')
    }

    return args
  }

  /** Parse /mcp tool calls from chat input. */
  function parseMcpCommand(
    input: string
  ): { tool: string; args: Record<string, string> } | null {
    const trimmed = input.trim()
    if (!trimmed.startsWith('/mcp ')) return null

    const body = trimmed.slice(5).trim()
    if (!body) return null

    const [tool, ...rest] = body.split(/\s+/)
    const args = parseMcpArgs(rest.join(' '))

    return { tool, args }
  }

  /** Apply set-semantics marks + font size across the whole document. */
  function applyBulkFormats(formats: string[], fontSize?: number): void {
    if (!editor || editor.isDestroyed) return
    let chain = editor.chain().focus().selectAll()
    for (const format of formats) {
      if (format === 'bold') chain = chain.setMark('bold')
      else if (format === 'italic') chain = chain.setMark('italic')
      else if (format === 'underline') chain = chain.setMark('underline')
    }
    if (fontSize) chain = chain.setMark('textStyle', { fontSize: `${fontSize}pt` })
    chain.run()
    // Collapse the selection so subsequent typing isn't auto-formatted.
    editor.commands.setTextSelection(editor.state.doc.content.size)
  }

  /** Apply a confirmed formatting preview to the editor (selection or whole doc). */
  function handlePreviewApply(messageIndex: number, msg: ChatMessage): void {
    if (!editor) return

    const formats =
      msg.preview_formats && msg.preview_formats.length > 0
        ? msg.preview_formats
        : msg.preview_format && msg.preview_format !== 'body_text'
          ? [msg.preview_format]
          : []
    const scope = msg.preview_scope ?? 'selection'
    const fontSize = msg.preview_font_size ? msg.preview_font_size : undefined

    const applied: string[] = []
    for (const format of formats) applied.push(formatPreviewLabel(format))
    if (fontSize) applied.push(`size ${fontSize}pt`)

    if (scope === 'all') {
      applyBulkFormats(formats, fontSize)
    } else {
      onFocusEditor?.()
      for (const format of formats) {
        const command = SELECTION_COMMANDS[format]
        if (command) command(editor)
      }
      if (fontSize && editor.isEditable) {
        editor.chain().focus().setMark('textStyle', { fontSize: `${fontSize}pt` }).run()
      }
    }

    if (applied.length > 0) {
      onFormatApplied?.(applied.join('+'))
    }

    if (documentId) {
      api.behavior
        .log({
          action: `chat_preview_accepted:${formats.join(',')}`,
          timestamp: new Date().toISOString(),
          documentId,
        })
        .catch((error) => console.error('Chat preview acceptance log failed', error))
    }

    api.ai
      .logFeedback({
        documentId: documentId || undefined,
        predictionType: 'chat_preview',
        predictedFormat: formats.join(','),
        accepted: true,
      })
      .catch((error) => console.error('Chat preview acceptance feedback log failed', error))

    onFeedbackLogged?.()

    setMessages((current) =>
      current.map((message, index) =>
        index === messageIndex
          ? {
              ...message,
              preview_status: 'applied',
              command_applied: applied.length > 0 ? applied.join(' + ') : formatPreviewLabel(msg.preview_format ?? ''),
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

    api.ai
      .logFeedback({
        documentId: documentId || undefined,
        predictionType: 'chat_preview',
        predictedFormat: format,
        accepted: false,
      })
      .catch((error) => console.error('Chat preview rejection feedback log failed', error))

    onFeedbackLogged?.()


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

    const mcpCommand = parseMcpCommand(userMsg)
    if (mcpCommand) {
      try {
        const toolArgs: Record<string, unknown> = { ...mcpCommand.args }

        if (mcpCommand.tool === 'getDocumentContent' && documentId) {
          toolArgs.documentId = documentId
        }

        if (mcpCommand.tool === 'getBehaviorSummary' && documentId) {
          toolArgs.documentId = documentId
        }

        if (mcpCommand.tool === 'predictNextFormat') {
          toolArgs.text = documentContent
        }

        if (mcpCommand.tool === 'applyFormatting') {
          if (documentId) toolArgs.documentId = documentId
          if (!toolArgs.mode) toolArgs.mode = 'preview'
        }

        const result = await api.mcp.callTool(mcpCommand.tool as never, toolArgs)
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: `MCP ${mcpCommand.tool} result:\n${JSON.stringify(result, null, 2)}`,
          },
        ])

        // A committed applyFormatting call actually applies the format to the
        // editor (works with keyboard or mouse selections, or a collapsed cursor).
        if (
          mcpCommand.tool === 'applyFormatting' &&
          toolArgs.mode === 'commit' &&
          typeof toolArgs.format === 'string'
        ) {
          const command = SELECTION_COMMANDS[toolArgs.format]
          if (editor && command) {
            command(editor)
            onFormatApplied?.(toolArgs.format)
            if (documentId) {
              api.behavior
                .log({
                  action: `mcp_format_applied:${toolArgs.format}`,
                  timestamp: new Date().toISOString(),
                  documentId,
                })
                .catch((error) => console.error('MCP format applied log failed', error))
            }
          }
        }
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: error instanceof Error ? error.message : 'MCP tool call failed.',
          },
        ])
      } finally {
        setLoading(false)
      }
      return
    }

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
        preview_formats:
          response.preview?.formats && response.preview.formats.length > 0
            ? response.preview.formats
            : null,
        preview_scope: response.preview?.scope ?? null,
        preview_font_size: response.preview?.fontSize ?? null,
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
      {/* Floating button (hidden when docked inside the side panel) */}
      {!docked && (
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
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {(open || docked) && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.2 }}
            style={{
              position: docked ? 'relative' : 'absolute',
              bottom: docked ? undefined : '56px',
              right: docked ? undefined : 0,
              width: docked ? '100%' : '320px',
              height: docked ? '100%' : undefined,
              backgroundColor: 'var(--card)',
              boxShadow: docked
                ? 'none'
                : 'var(--border-shadow) 0px 0px 0px 1px, rgba(0, 0, 0, 0.08) 0px 4px 12px, inset 0px 0px 0px 1px var(--card-shadow-inner)',
              borderRadius: docked ? 0 : '0.75rem',
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
            <div style={{ flex: docked ? 1 : undefined, height: docked ? '0px' : '256px', minHeight: 0, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
                    {m.preview_status || m.preview_format || (m.preview_formats?.length ?? 0) > 0 || m.preview_font_size ? (
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
                            marginBottom: m.preview_reason || m.preview_scope ? '0.25rem' : 0,
                          }}
                        >
                          {describePreview(m)}
                          {m.preview_scope === 'all' && (
                            <span style={{ fontSize: '0.6875rem', fontWeight: 500, opacity: 0.75 }}>
                              {' '}
                              — entire document
                            </span>
                          )}
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
                              onClick={() => handlePreviewApply(i, m)}
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
                    ) : null}
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
