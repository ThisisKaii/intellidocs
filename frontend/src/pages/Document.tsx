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
import SuggestionOverlay, { type GrammarIssue } from '@/components/editor/SuggestionOverlay'
import { ArrowLeft, Save, Moon, Sun } from 'lucide-react'

const AUTOSAVE_DELAY = 8000

export default function Document(): JSX.Element {
  const { id } = useParams()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef<boolean>(false)
  const latestTitleRef = useRef<string>('Untitled Document')
  const latestContentRef = useRef<string>('')
  const latestFormatHistoryRef = useRef<string[]>([])
  const pendingSaveRef = useRef<boolean>(false)

  const [title, setTitle] = useState<string>('Untitled Document')
  const [content, setContent] = useState<string>('')
  const [_lastSavedTitle, setLastSavedTitle] = useState<string>('Untitled Document')
  const [_lastSavedContent, setLastSavedContent] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [wordCount, setWordCount] = useState<number>(0)
  const [formatHistory, setFormatHistory] = useState<string[]>([])
  const [_behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([])

  const [rightPanelOpen] = useState<boolean>(true)
  const [suggestions, _setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const [formatPrompt, setFormatPrompt] = useState<FormatSuggestion | null>(null)
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([])

  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark')
  })

  function toggleTheme() {
    const nextDark = !isDark
    setIsDark(nextDark)
    const root = window.document.documentElement
    if (nextDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  useEffect(() => {
    if (!id) return
    async function loadDocument(): Promise<void> {
      try {
        const doc = await api.documents.get(id as string)
        const nextTitle = doc.title || 'Untitled Document'
        const nextContent = doc.content || ''
        setTitle(nextTitle)
        setContent(nextContent)
        latestTitleRef.current = nextTitle
        latestContentRef.current = nextContent
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

  useEffect(() => {
    latestTitleRef.current = title
  }, [title])

  useEffect(() => {
    latestContentRef.current = content
  }, [content])

  useEffect(() => {
    latestFormatHistoryRef.current = formatHistory
  }, [formatHistory])

  function updateWordCount(html: string): void {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    setWordCount(text ? text.split(' ').filter((w) => w.length > 0).length : 0)
  }

  function scheduleSave(): void {
    pendingSaveRef.current = true
    setSaveStatus('unsaved')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      void saveDocument()
    }, AUTOSAVE_DELAY)
  }

  async function saveDocument(): Promise<void> {
    if (!id) return

    if (savingRef.current) {
      pendingSaveRef.current = true
      return
    }

    const nextTitle = latestTitleRef.current
    const nextContent = editorRef.current?.innerHTML ?? latestContentRef.current
    const nextFormatHistory = latestFormatHistoryRef.current

    savingRef.current = true
    pendingSaveRef.current = false
    setSaveStatus('saving')

    try {
      await api.documents.update(id, {
        title: nextTitle,
        content: nextContent,
        formatting_history: nextFormatHistory,
      })
      latestContentRef.current = nextContent
      setContent(nextContent)
      setLastSavedTitle(nextTitle)
      setLastSavedContent(nextContent)
      setSaveStatus('saved')
    } catch (error) {
      console.error('Autosave failed', error)
      pendingSaveRef.current = true
      setSaveStatus('unsaved')
    } finally {
      savingRef.current = false

      if (pendingSaveRef.current) {
        if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
        autosaveTimer.current = setTimeout(() => {
          void saveDocument()
        }, AUTOSAVE_DELAY)
      }
    }
  }

  function handleContentChange(newContent: string): void {
    latestContentRef.current = newContent
    setContent(newContent)
    updateWordCount(newContent)
    scheduleSave()
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextTitle = event.target.value
    latestTitleRef.current = nextTitle
    setTitle(nextTitle)
    scheduleSave()
  }

  function handleFormat(formatType: string): void {
    const nextContent = editorRef.current?.innerHTML || content
    latestContentRef.current = nextContent
    setContent(nextContent)
    setFormatHistory((prev) => {
      const nextHistory = [...prev, formatType]
      latestFormatHistoryRef.current = nextHistory
      return nextHistory
    })
    if (id) {
      const event = createBehaviorEvent(formatType, id)
      setBehaviorEvents((prev) => [...prev, event])
      api.behavior.log(event).catch((err) => console.error('Behavior log failed', err))
    }
    setShowSuggestions(false)
    scheduleSave()
    updateWordCount(nextContent)
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

  function handleGrammarApply(issue: GrammarIssue): void {
    if (!editorRef.current) return
    const editor = editorRef.current
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null)
    let node = walker.nextNode()
    let applied = false

    while (node && !applied) {
      const text = node.nodeValue || ''
      const index = text.indexOf(issue.original)
      if (index !== -1) {
        node.nodeValue =
          text.substring(0, index) +
          issue.suggestion +
          text.substring(index + issue.original.length)
        applied = true
      }
      node = walker.nextNode()
    }

    if (applied) {
      handleContentChange(editor.innerHTML)
    }
    setGrammarIssues((prev) => prev.filter((i) => i !== issue))
  }

  function handleGrammarDismiss(issue: GrammarIssue): void {
    setGrammarIssues((prev) => prev.filter((i) => i !== issue))
  }

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current)
      }
    }
  }, [])

  const getEditorText = useCallback(() => editorRef.current?.innerText || '', [])
  function focusEditor(): void { editorRef.current?.focus() }

  async function handleManualSave(): Promise<void> {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current)
      autosaveTimer.current = null
    }
    pendingSaveRef.current = true
    await saveDocument()
  }


  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden', backgroundColor: 'var(--background)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          backgroundColor: 'var(--background)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Main nav row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: '56px',
            padding: '0 1.5rem',
            gap: '1rem',
          }}
        >
          {/* Left: back + brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <Link
              to="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '0.5rem',
                color: 'var(--muted-foreground)',
                backgroundColor: 'transparent',
                textDecoration: 'none',
                transition: 'background-color 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'var(--secondary)'
                ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--foreground)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent'
                ;(e.currentTarget as HTMLAnchorElement).style.color = 'var(--muted-foreground)'
              }}
            >
              <ArrowLeft style={{ width: '16px', height: '16px' }} />
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '5px',
                  backgroundColor: 'var(--primary)',
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '12px', height: '12px' }}>
                  <path d="M12 2L2 22h20L12 2z" />
                </svg>
              </div>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--foreground)' }}>IntelliDocs</span>
            </div>
          </div>

          {/* Center: inline document title */}
          <div style={{ flex: 1, maxWidth: '480px', margin: '0 auto' }}>
            <input
              value={title}
              onChange={handleTitleChange}
              placeholder="Untitled Document"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '0.9375rem',
                fontWeight: 500,
                color: 'var(--foreground)',
                textAlign: 'center',
                fontFamily: 'inherit',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.375rem',
                transition: 'background-color 150ms',
              }}
              onFocus={(e) => { e.currentTarget.style.backgroundColor = 'var(--secondary)' }}
              onBlur={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            />
          </div>

          {/* Right: save status + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <span
              style={{
                fontSize: '0.75rem',
                color: saveStatus === 'saving' ? 'var(--foreground)' : 'var(--muted-foreground)',
                transition: 'color 200ms',
              }}
            >
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : 'Saved'}
            </span>

            <button
              type="button"
              onClick={() => { void handleManualSave() }}
              disabled={saveStatus === 'saving'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                height: '32px',
                padding: '0 0.75rem',
                borderRadius: '0.5rem',
                border: 'none',
                boxShadow: '0 0 0 1px var(--border-shadow)',
                backgroundColor: 'transparent',
                color: 'var(--foreground)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: saveStatus === 'saving' ? 'not-allowed' : 'pointer',
                opacity: saveStatus === 'saving' ? 0.5 : 1,
                fontFamily: 'inherit',
                transition: 'background-color 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              <Save style={{ width: '14px', height: '14px' }} />
              Save
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              title="Toggle theme"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '0.5rem',
                border: 'none',
                boxShadow: '0 0 0 1px var(--border-shadow)',
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                transition: 'background-color 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)'
              }}
            >
              {isDark ? <Sun style={{ width: '14px', height: '14px' }} strokeWidth={1.5} /> : <Moon style={{ width: '14px', height: '14px' }} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Toolbar row */}
        <div style={{ padding: '0 1.5rem', borderTop: '1px solid var(--border)' }}>
          <Toolbar onFormatApplied={handleFormat} onFocusEditor={focusEditor} />
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Editor area */}
        <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, position: 'relative' }}>
          <div style={{ maxWidth: '680px', margin: '0 auto', padding: '3rem 2rem', position: 'relative' }}>
            <EditorCore
              ref={editorRef}
              onContentChange={handleContentChange}
              initialContent={content}
            />
            <SuggestionOverlay
              editorRef={editorRef}
              issues={grammarIssues}
              content={content}
              onApply={handleGrammarApply}
              onDismiss={handleGrammarDismiss}
            />
          </div>
        </main>

        {/* Right panel */}
        <AnimatePresence>
          {rightPanelOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 272, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{
                borderLeft: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* Predictions section */}
                <div>
                  <p
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--muted-foreground)',
                      margin: '0 0 0.625rem',
                    }}
                  >
                    Predictions
                  </p>
                  <SuggestionPanel
                    suggestions={suggestions}
                    onApply={(fmt) => handlePromptAccept(fmt)}
                    onDismiss={() => setShowSuggestions(false)}
                  />
                  {!showSuggestions && (
                    <div
                      style={{
                        borderRadius: '0.5rem',
                        padding: '0.875rem',
                        textAlign: 'center',
                        backgroundColor: 'var(--secondary)',
                      }}
                    >
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                        Predictions appear as you type and format
                      </p>
                    </div>
                  )}
                </div>

                {/* Grammar panel */}
                <GrammarPanel text={content} onCheckComplete={setGrammarIssues} />

                {/* Session stats */}
                <div
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    padding: '0.75rem',
                  }}
                >
                  <p
                    style={{
                      fontSize: '0.6875rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--muted-foreground)',
                      margin: '0 0 0.5rem',
                    }}
                  >
                    Session
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>Words</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{wordCount}</span>
                  </div>
                </div>

              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* Format prompt (float) */}
      <div
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 50,
          pointerEvents: formatPrompt ? 'all' : 'none',
        }}
      >
        <FormatPrompt
          suggestion={formatPrompt}
          onAccept={handlePromptAccept}
          onReject={handlePromptReject}
        />
      </div>

      {/* AI Chatbot (float) */}
      <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 50 }}>
        <AIChatbot
          documentId={id}
          documentTitle={title}
          documentContent={getEditorText()}
          onFormatApplied={handleFormat}
        />
      </div>
    </div>
  )
}