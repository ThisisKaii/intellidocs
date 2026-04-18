import { useEffect, useRef, useState, useCallback, type ChangeEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '@/services/api'
import { Toolbar } from '@/components/editor/Toolbar'
import { EditorCore } from '@/components/editor/EditorCore'
import {
  type BehaviorEvent,
  createBehaviorEvent,
} from '@/components/editor/behaviorListener'
import SuggestionPanel, { type Suggestion } from '@/components/editor/SuggestionPanel'
import GrammarPanel from '@/components/editor/GrammarPanel'
import FormatPrompt, { type FormatSuggestion } from '@/components/editor/FormatPrompt'
import AIChatbot from '@/components/editor/AIChatbot'
import { Sparkles, ArrowLeft, Save, Brain, Moon, Sun } from 'lucide-react'

const AUTOSAVE_DELAY = 8000

export default function Document(): JSX.Element {
  const { id } = useParams()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef<boolean>(false)
  const sessionId = useRef(`session_${Date.now()}`)

  const [title, setTitle] = useState<string>('Untitled Document')
  const [content, setContent] = useState<string>('')
  const [_lastSavedTitle, setLastSavedTitle] = useState<string>('Untitled Document')
  const [_lastSavedContent, setLastSavedContent] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [wordCount, setWordCount] = useState<number>(0)
  const [formatHistory, setFormatHistory] = useState<string[]>([])
  const [_behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([])

  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true)
  const [suggestions, _setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const [formatPrompt, setFormatPrompt] = useState<FormatSuggestion | null>(null)
  const [isDark, setIsDark] = useState<boolean>(() => document.documentElement.classList.contains('dark'))

  const toggleTheme = useCallback(() => {
    const root = document.documentElement
    if (root.classList.contains('dark')) {
      root.classList.remove('dark')
      setIsDark(false)
    } else {
      root.classList.add('dark')
      setIsDark(true)
    }
  }, [])

  /* ── Load document ── */
  useEffect(() => {
    if (!id) return
    async function loadDocument(): Promise<void> {
      try {
        const doc = await api.documents.get(id as string)
        const nextTitle = doc.title || 'Untitled Document'
        const nextContent = doc.content || ''
        setTitle(nextTitle)
        setContent(nextContent)
        setLastSavedTitle(nextTitle)
        setLastSavedContent(nextContent)
        setSaveStatus('saved')
        updateWordCount(nextContent)
      } catch (error) {
        console.error(error)
      }
    }
    loadDocument()
  }, [id])

  /* ── Helpers ── */
  function updateWordCount(html: string): void {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    setWordCount(text ? text.split(' ').filter((w) => w.length > 0).length : 0)
  }

  function scheduleSave(): void {
    setSaveStatus('unsaved')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(saveDocument, AUTOSAVE_DELAY)
  }

  async function saveDocument(): Promise<void> {
    if (!id || savingRef.current) return
    savingRef.current = true
    setSaveStatus('saving')
    try {
      await api.documents.update(id, { title, content, formatting_history: formatHistory })
      setLastSavedTitle(title)
      setLastSavedContent(content)
      setSaveStatus('saved')
    } catch (error) {
      console.error('Autosave failed', error)
      setSaveStatus('unsaved')
    } finally {
      savingRef.current = false
    }
  }

  function handleContentChange(newContent: string): void {
    setContent(newContent)
    updateWordCount(newContent)
    scheduleSave()
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>): void {
    setTitle(event.target.value)
    scheduleSave()
  }

  function handleFormat(formatType: string): void {
    setFormatHistory((prev) => [...prev, formatType])
    if (id) {
      const event = createBehaviorEvent(formatType, id)
      setBehaviorEvents((prev) => [...prev, event])
      api.behavior.log(event).catch((err) => console.error('Behavior log failed', err))
    }
    setShowSuggestions(false)
    scheduleSave()
    updateWordCount(editorRef.current?.innerHTML || '')
  }

  function handlePromptAccept(format: string): void {
    editorRef.current?.focus()
    switch (format) {
      case 'bold': document.execCommand('bold', false); break
      case 'italic': document.execCommand('italic', false); break
      case 'underline': document.execCommand('underline', false); break
      case 'heading1': case 'h1': document.execCommand('formatBlock', false, '<h1>'); break
      case 'heading2': case 'h2': document.execCommand('formatBlock', false, '<h2>'); break
      case 'heading3': case 'h3': document.execCommand('formatBlock', false, '<h3>'); break
      case 'unordered_list': case 'ul': document.execCommand('insertUnorderedList', false); break
      case 'ordered_list': case 'ol': document.execCommand('insertOrderedList', false); break
      case 'blockquote': document.execCommand('formatBlock', false, '<blockquote>'); break
      default: break
    }
    handleFormat(format)
    setFormatPrompt(null)
    setShowSuggestions(false)
  }

  function handlePromptReject(): void {
    setFormatPrompt(null)
    setShowSuggestions(false)
  }

  const getEditorText = useCallback(() => editorRef.current?.innerText || '', [])
  function focusEditor(): void { editorRef.current?.focus() }

  /* ── Render ── */
  return (
    <div className="h-screen w-full overflow-hidden bg-background flex flex-col">

      {/* ═══ TOP BAR ═══ */}
      <header className="border-b border-border bg-card sticky top-0 z-40">
        <div className="flex items-center justify-between pl-6 pr-8 py-4">

          {/* Left: ← IntelliDocs */}
          <div className="flex items-center gap-4 shrink-0">
            <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-foreground rounded flex items-center justify-center">
                <Sparkles className="w-3 h-3 text-background" />
              </div>
              <span className="font-fraunces font-semibold text-sm tracking-tight">IntelliDocs</span>
            </div>
          </div>

          {/* Center: title */}
          <div className="flex-1 max-w-xl mx-auto">
            <input
              value={title}
              onChange={handleTitleChange}
              className="w-full font-fraunces text-lg font-bold bg-transparent border-none outline-none focus:outline-none focus:ring-0 shadow-none text-foreground placeholder:text-muted-foreground text-center"
              placeholder="Untitled Document"
              style={{ boxShadow: 'none' }}
            />
          </div>

          {/* Right: word count · saved · theme · AI Panel */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex items-center gap-3 pr-2 border-r border-border/50">
              <span className="font-inter text-xs text-muted-foreground whitespace-nowrap">
                {wordCount} words
              </span>
              <span className={`font-inter text-xs flex items-center gap-1 whitespace-nowrap ${
                saveStatus === 'saving' ? 'text-accent' : 'text-muted-foreground'
              }`}>
                <Save className="w-3 h-3" />
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
              </span>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              className="flex items-center justify-center w-9 h-9 border border-border/80 rounded-[14px] text-muted-foreground hover:text-foreground bg-white dark:bg-[#272a31] transition-colors"
              title="Toggle Theme"
            >
              {isDark ? <Sun className="w-4 h-4" strokeWidth={1.5} /> : <Moon className="w-4 h-4" strokeWidth={1.5} />}
            </button>

            <button
              type="button"
              onClick={() => setRightPanelOpen((o) => !o)}
              className="flex items-center gap-1.5 text-[13px] font-inter font-medium text-primary-foreground hover:brightness-110 transition-all px-4 py-2 rounded-xl bg-primary shadow-none"
            >
              <Brain className="w-4 h-4" />
              AI Panel
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2 border-t border-border/40 bg-card">
          <Toolbar onFormatApplied={handleFormat} onFocusEditor={focusEditor} />
        </div>
      </header>

      {/* ═══ MAIN LAYOUT ═══ */}
      <div className="flex flex-1 min-h-0">

        {/* Editor canvas */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-2xl mx-auto px-8 py-12">
            <EditorCore
              ref={editorRef}
              onContentChange={handleContentChange}
              initialContent={content}
            />
          </div>
        </main>

        {/* Right AI panel */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 310, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="border-l border-border bg-card shrink-0 flex flex-col"
            >
              <div className="flex-1 w-full overflow-y-auto overflow-x-hidden">
                <div className="p-5 pr-6 space-y-5">

                  {/* ── Predictions section ── */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-inter text-xs font-bold tracking-wider text-muted-foreground/80">
                      PREDICTIONS
                    </span>
                    {!showSuggestions && (
                      <span className="font-inter text-xs text-muted-foreground/60">Type to activate...</span>
                    )}
                  </div>

                  {/* SuggestionPanel renders when there are suggestions */}
                  <SuggestionPanel
                    suggestions={suggestions}
                    onApply={(fmt) => handlePromptAccept(fmt)}
                    onDismiss={() => setShowSuggestions(false)}
                  />

                  {/* Empty state when no suggestions */}
                  {!showSuggestions && (
                    <div className="bg-secondary/40 rounded-lg p-6 py-8 text-center">
                      <Brain className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
                      <p className="font-inter text-xs text-muted-foreground/70 px-4 leading-relaxed">
                        Predictions appear as you type and format
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Grammar panel ── */}
                <GrammarPanel text={getEditorText()} />

                {/* ── Session stats ── */}
                <div className="bg-transparent border border-border/50 rounded-md p-4 max-w-full">
                  <p className="font-inter text-xs font-bold tracking-wider text-muted-foreground/80 mb-3">
                    SESSION
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-inter text-xs text-muted-foreground">Words</span>
                      <span className="font-inter text-xs font-semibold">{wordCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-inter text-xs text-muted-foreground">Session ID</span>
                      <span className="font-inter text-xs font-medium font-mono opacity-50">
                        {sessionId.current.slice(-6)}
                      </span>
                    </div>
                    </div>
                  </div>
                </div>

              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ FORMAT PROMPT (floating) ═══ */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50" style={{ pointerEvents: formatPrompt ? 'all' : 'none' }}>
        <FormatPrompt
          suggestion={formatPrompt}
          onAccept={handlePromptAccept}
          onReject={handlePromptReject}
        />
      </div>

      {/* ═══ AI CHATBOT (floating) ═══ */}
      <div className="fixed bottom-6 right-8 z-50">
        <div className="relative">
          <AIChatbot
            documentId={id}
            documentContent={getEditorText()}
            onFormatApplied={handleFormat}
          />
        </div>
      </div>
    </div>
  )
}