import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  command_applied?: string | null
}

interface AIChatbotProps {
  documentId: string | undefined
  documentContent: string
  onFormatApplied?: (format: string) => void
}

/** Floating AI chatbot for natural language formatting commands. */
export default function AIChatbot({ documentId: _documentId, documentContent: _documentContent, onFormatApplied: _onFormatApplied }: AIChatbotProps): JSX.Element {
  const [open, setOpen] = useState<boolean>(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: 'Hello! I\'m your IntelliDocs AI assistant. I can format your document using natural language — try "make the selected text bold", "turn this into a heading", or "add a blockquote".',
    },
  ])
  const [input, setInput] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /** Send a message to the AI assistant. */
  async function send(): Promise<void> {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: userMsg }])
    setLoading(true)

    // TODO: Wire to aiClient.ts via MCP tools
    // For now, echo a placeholder response
    await new Promise((resolve) => setTimeout(resolve, 800))

    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: `I understand you want to "${userMsg}". This will be wired to your AI provider once the MCP tools are connected.`,
    }

    setMessages((m) => [...m, assistantMsg])
    setLoading(false)
  }

  return (
    <>
      {/* Floating button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-10 h-10 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:opacity-90 transition-opacity"
        title="AI Assistant"
      >
        {open ? <X className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
      </button>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-14 right-0 w-80 bg-card border border-border rounded-xl shadow-lg overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-secondary/50">
              <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-primary-foreground" />
              </div>
              <div>
                <p className="font-inter text-sm font-semibold">AI Assistant</p>
                <p className="font-inter text-xs text-muted-foreground">Natural language formatting</p>
              </div>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto p-3 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-lg font-inter text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground'
                    }`}
                  >
                    {m.content}
                    {m.command_applied && (
                      <div className="mt-1.5 text-xs opacity-70 flex items-center gap-1">
                        ✓ Applied: {m.command_applied}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary px-3 py-2 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-3 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') send() }}
                placeholder="Type a formatting command..."
                className="flex-1 text-sm font-inter bg-secondary rounded-md px-3 py-2 outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-accent/40"
              />
              <button
                type="button"
                onClick={send}
                disabled={!input.trim() || loading}
                className="p-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
