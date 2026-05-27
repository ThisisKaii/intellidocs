import { useEffect, useRef, useState, useCallback, type ChangeEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { api, type BehaviorSummaryResponse } from '@/services/api'
import { Toolbar } from '@/components/editor/Toolbar'
import { EditorCore } from '@/components/editor/EditorCore'
import { restoreSelection } from '@/components/editor/SelectionManager'
import {
  type BehaviorEvent,
  createBehaviorEvent,
} from '@/components/editor/behaviorListener'
import SuggestionPanel, { type Suggestion } from '@/components/editor/SuggestionPanel'
import GrammarPanel from '@/components/editor/GrammarPanel'
import FormatPrompt, { type FormatSuggestion } from '@/components/editor/FormatPrompt'
import AIChatbot from '@/components/editor/AIChatbot'
import SuggestionOverlay, { type GrammarIssue } from '@/components/editor/SuggestionOverlay'
import McpDebugPanel from '@/components/editor/McpDebugPanel'

import { ArrowLeft, Save, Moon, Sun } from 'lucide-react'

const AUTOSAVE_DELAY = 8000

const AUTO_FORMAT_DELAY = 1800
const AUTO_FORMAT_CONFIDENCE_THRESHOLD = 0.7
const AUTO_FORMAT_SUPPRESSION_MS = 5 * 60 * 1000
const AUTO_FORMAT_MIN_INTERVAL_MS = 30 * 1000

/* Page dimensions at 96dpi (US Letter 8.5" x 11") */
const PAGE_WIDTH = 816
const PAGE_HEIGHT = 1056
const PAGE_PAD_Y = 64   // 4rem
const PAGE_PAD_X = 72   // 4.5rem
const PAGE_GAP = 24
const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_PAD_Y * 2 // 928px
const SPACER_ATTR = 'data-page-break'

interface EditorPagesProps {
  editorRef: React.RefObject<HTMLDivElement>
  content: string
  onContentChange: (html: string) => void
  grammarIssues: GrammarIssue[]
  onGrammarApply: (issue: GrammarIssue) => void
  onGrammarDismiss: (issue: GrammarIssue) => void
}

/** Strip page-break spacer elements from HTML before saving. */
function stripSpacers(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  div.querySelectorAll(`[${SPACER_ATTR}]`).forEach(el => el.remove())
  return div.innerHTML
}

/** Insert page-break spacers into the editor DOM at page boundaries. */
function insertPageBreaks(editor: HTMLElement): number {
  // Remove old spacers
  editor.querySelectorAll(`[${SPACER_ATTR}]`).forEach(el => el.remove())

  const children = Array.from(editor.children) as HTMLElement[]
  if (children.length === 0) return 1

  let pageBottom = CONTENT_HEIGHT // first page content limit
  let pages = 1

  for (const child of children) {
    const childTop = child.offsetTop
    const childBottom = childTop + child.offsetHeight

    if (childBottom > pageBottom && childTop < pageBottom) {
      // Child crosses the page boundary — insert spacer before it
      const remaining = pageBottom - childTop
      const spacerH = remaining + PAGE_PAD_Y + PAGE_GAP + PAGE_PAD_Y
      const spacer = document.createElement('div')
      spacer.setAttribute(SPACER_ATTR, 'true')
      spacer.contentEditable = 'false'
      spacer.style.cssText = `height:${spacerH}px;pointer-events:none;user-select:none;margin:0;padding:0;border:none;`
      child.parentNode?.insertBefore(spacer, child)
      pages++
      pageBottom = spacer.offsetTop + spacerH + CONTENT_HEIGHT
    } else if (childTop >= pageBottom) {
      // Child starts past the boundary — insert spacer before it
      const spacerH = PAGE_PAD_Y + PAGE_GAP + PAGE_PAD_Y
      const spacer = document.createElement('div')
      spacer.setAttribute(SPACER_ATTR, 'true')
      spacer.contentEditable = 'false'
      spacer.style.cssText = `height:${spacerH}px;pointer-events:none;user-select:none;margin:0;padding:0;border:none;`
      child.parentNode?.insertBefore(spacer, child)
      pages++
      pageBottom = spacer.offsetTop + spacerH + CONTENT_HEIGHT
    }
  }

  return pages
}

/** Multi-page editor container that renders paper-like pages. */
function EditorPages({
  editorRef,
  content,
  onContentChange,
  grammarIssues,
  onGrammarApply,
  onGrammarDismiss,
}: EditorPagesProps): JSX.Element {
  const [numPages, setNumPages] = useState(1)

  /** Recalculate page breaks after content changes. */
  const recalcPages = useCallback(() => {
    if (!editorRef.current) return
    const p = insertPageBreaks(editorRef.current)
    setNumPages(p)
  }, [editorRef])

  /* Run page-break calculation on content change. */
  useEffect(() => {
    const t = setTimeout(recalcPages, 50)
    return () => clearTimeout(t)
  }, [content, recalcPages])

  /** Wrap onContentChange to strip spacers before saving. */
  const handleContentChange = useCallback((html: string) => {
    onContentChange(stripSpacers(html))
  }, [onContentChange])

  const totalHeight = numPages * PAGE_HEIGHT + (numPages - 1) * PAGE_GAP

  return (
    <main style={{ flex: 1, overflowY: 'auto', minWidth: 0, position: 'relative', backgroundColor: 'var(--secondary)' }}>
      <div style={{
        maxWidth: `${PAGE_WIDTH}px`,
        minHeight: `${totalHeight}px`,
        margin: '2rem auto',
        position: 'relative',
      }}>
        {/* Page backgrounds */}
        {Array.from({ length: numPages }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${i * (PAGE_HEIGHT + PAGE_GAP)}px`,
              left: 0,
              right: 0,
              height: `${PAGE_HEIGHT}px`,
              backgroundColor: 'var(--background)',
              boxShadow: 'rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 4px, rgba(0,0,0,0.03) 0px 8px 16px',
              borderRadius: '2px',
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Content layer */}
        <div style={{
          position: 'relative',
          padding: `${PAGE_PAD_Y}px ${PAGE_PAD_X}px`,
          minHeight: `${CONTENT_HEIGHT}px`,
        }}>
          <div style={{ position: 'relative' }}>
            <EditorCore
              ref={editorRef}
              onContentChange={handleContentChange}
              initialContent={content}
            />
            <SuggestionOverlay
              editorRef={editorRef}
              issues={grammarIssues}
              content={content}
              onApply={onGrammarApply}
              onDismiss={onGrammarDismiss}
            />
          </div>
        </div>
      </div>
    </main>
  )
}

export default function Document(): JSX.Element {
  const { id } = useParams()
  const editorRef = useRef<HTMLDivElement | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef<boolean>(false)
  const latestTitleRef = useRef<string>('Untitled Document')
  const latestContentRef = useRef<string>('')
  const latestFormatHistoryRef = useRef<string[]>([])
  const pendingSaveRef = useRef<boolean>(false)
  const autoFormatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressedAutoFormatsRef = useRef<Record<string, number>>({})
  const lastAutoFormatRef = useRef<{format : string; shownAt: number} | null>(null)

  const [title, setTitle] = useState<string>('Untitled Document')
  const [content, setContent] = useState<string>('')
  const [_lastSavedTitle, setLastSavedTitle] = useState<string>('Untitled Document')
  const [_lastSavedContent, setLastSavedContent] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [wordCount, setWordCount] = useState<number>(0)
  const [formatHistory, setFormatHistory] = useState<string[]>([])
  const [_behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([])
  const [behaviorSummary, setBehaviorSummary] = useState<BehaviorSummaryResponse | null>(null)
  const [behaviorSummaryLoading, setBehaviorSummaryLoading] = useState<boolean>(false)

  const [rightPanelOpen] = useState<boolean>(true)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const [formatPrompt, setFormatPrompt] = useState<FormatSuggestion | null>(null)
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([])

  const chatContent = getPlainText(content)

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

  async function loadBehaviorSummary(): Promise<void> {
    if (!id) return

    setBehaviorSummaryLoading(true)

    try {
      const summary = await api.behavior.summary(id)
      setBehaviorSummary(summary)
    } catch (error) {
      console.error('Behavior summary load failed', error)
    } finally {
      setBehaviorSummaryLoading(false)
    }
  }

  useEffect(() => {
    void loadBehaviorSummary()
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

  function shouldSkipAutoFormatSuggestion(format: string): boolean {
    const last = lastAutoFormatRef.current

    if (!last) return false

    if (last.format !== format) return false

    return Date.now() - last.shownAt < AUTO_FORMAT_MIN_INTERVAL_MS
  }

  function getPlainText(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }

  function formatSuggestionLabel(format: string): string {
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
      paragraph: 'Paragraph',
    }

    return labels[format] ?? format
  }

  function isAutoFormatSuppressed(format: string): boolean {
    const suppressedUntil = suppressedAutoFormatsRef.current[format]

    if (!suppressedUntil) return false

    if (Date.now() > suppressedUntil) {
      delete suppressedAutoFormatsRef.current[format]
      return false
    }

    return true
  }

  function hasVisibleTextSelection(): boolean {
    const selection = window.getSelection()
    return Boolean(selection && selection.rangeCount > 0 && selection.toString().trim())
  }

  function findEditableBlock(node: Node | null, editor: HTMLElement): HTMLElement | null {
    let current =
      node instanceof HTMLElement ? node : node?.parentElement ?? null

    while (current && current !== editor) {
      if (
        ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(
          current.tagName
        )
      ) {
        return current
      }

      current = current.parentElement
    }

    return null
  }

  function selectCurrentBlockForInlineFormat(editor: HTMLElement): void {
    const selection = window.getSelection()

    if (!selection || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)
    const block = findEditableBlock(range.startContainer, editor)

    if (!block) {
      return
    }

    const nextRange = document.createRange()
    nextRange.selectNodeContents(block)

    selection.removeAllRanges()
    selection.addRange(nextRange)
  }

  function applyPromptFormat(format: string): void {
    const editor = editorRef.current
    if (!editor) return

    editor.focus()
    restoreSelection()

    const inlineFormats = new Set(['bold', 'italic', 'underline'])

    if (inlineFormats.has(format) && !hasVisibleTextSelection()) {
      selectCurrentBlockForInlineFormat(editor)
    }

    switch (format) {
      case 'bold':
        document.execCommand('bold', false)
        break
      case 'italic':
        document.execCommand('italic', false)
        break
      case 'underline':
        document.execCommand('underline', false)
        break
      case 'heading1':
      case 'h1':
        document.execCommand('formatBlock', false, '<h1>')
        break
      case 'heading2':
      case 'h2':
        document.execCommand('formatBlock', false, '<h2>')
        break
      case 'heading3':
      case 'h3':
        document.execCommand('formatBlock', false, '<h3>')
        break
      case 'unordered_list':
      case 'ul':
        document.execCommand('insertUnorderedList', false)
        break
      case 'ordered_list':
      case 'ol':
        document.execCommand('insertOrderedList', false)
        break
      case 'blockquote':
        document.execCommand('formatBlock', false, '<blockquote>')
        break
      default:
        break
    }
  }

  function scheduleAutoFormatPrediction(nextContent: string): void {
    if (autoFormatTimer.current) {
      clearTimeout(autoFormatTimer.current)
    }

    autoFormatTimer.current = setTimeout(() => {
      void runAutoFormatPrediction(nextContent)
    }, AUTO_FORMAT_DELAY)
  }

  async function runAutoFormatPrediction(nextContent: string): Promise<void> {
   const plainText = getPlainText(nextContent)

    if (plainText.length < 12) {
      setFormatPrompt(null)
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    try {
      const prediction = await api.predictions.predict(plainText)
      const predictedFormat = prediction.predicted_format
      const confidence = prediction.confidence

      if (confidence < AUTO_FORMAT_CONFIDENCE_THRESHOLD) {
        setFormatPrompt(null)
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      if (isAutoFormatSuppressed(predictedFormat)) {
        setFormatPrompt(null)
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      if (shouldSkipAutoFormatSuggestion(predictedFormat)){
        setFormatPrompt(null)
        setSuggestions([])
        setShowSuggestions(false)

        return

      }

      const confidencePercent = Math.round(confidence * 100)
      const suggestion = {
        format: predictedFormat,
        confidence: confidencePercent,
        reason: `Predicted ${formatSuggestionLabel(predictedFormat)} based on your recent writing context.`,
      }

      setFormatPrompt({
        format: predictedFormat,
        confidence: confidencePercent,
      })
      setSuggestions([suggestion])
      setShowSuggestions(true)

      lastAutoFormatRef.current = {
        format: predictedFormat,
        shownAt: Date.now(),
      }
    } catch (error) {
      console.error('Auto-format prediction failed', error)
    }
  }



  function countBehaviorBucket(bucket: Record<string, number> | undefined): number {
    return Object.values(bucket ?? {}).reduce((total, count) => total + count, 0)
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
  scheduleAutoFormatPrediction(newContent)
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
    setSuggestions([])
    scheduleSave()
    updateWordCount(nextContent)
  }

  function handlePromptAccept(format: string): void {
    applyPromptFormat(format)
    handleFormat(format)

    if (id) {
      api.behavior
        .log({
          action: `auto_preview_accepted:${format}`,
          timestamp: new Date().toISOString(),
          documentId: id,
        })
        .catch((error) => console.error('Auto-format acceptance log failed', error))
    }

    void loadBehaviorSummary()

    setFormatPrompt(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  function rejectAutoSuggestion(format: string): void {
    suppressedAutoFormatsRef.current[format] =
      Date.now() + AUTO_FORMAT_SUPPRESSION_MS

    if (id) {
      api.behavior
        .log({
          action: `auto_preview_rejected:${format}`,
          timestamp: new Date().toISOString(),
          documentId: id,
        })
        .catch((error) => console.error('Auto-format rejected log failed', error))
    }

    void loadBehaviorSummary()
  }

  function handlePromptReject(): void {
    const rejectedFormat = formatPrompt?.format ?? suggestions[0]?.format

    if (rejectedFormat) {
      rejectAutoSuggestion(rejectedFormat)
    }

    setFormatPrompt(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  function handleGrammarApply(issue: GrammarIssue): void {
    if (!editorRef.current) return

    function preserveReplacementCase(originalText: string, suggestion: string): string {
      if (!originalText || !suggestion) return suggestion

      if (originalText === originalText.toUpperCase()) {
        return suggestion.toUpperCase()
      }

      if (originalText[0] === originalText[0].toUpperCase()) {
        return suggestion[0].toUpperCase() + suggestion.slice(1)
      }

      return suggestion
    }

    const editor = editorRef.current
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null)
    const originalNeedle = issue.original.toLowerCase()
    let node = walker.nextNode()
    let applied = false

    while (node && !applied) {
      const text = node.nodeValue || ''
      const index = text.toLowerCase().indexOf(originalNeedle)

      if (index !== -1) {
        const matchedText = text.substring(index, index + issue.original.length)
        const replacement = preserveReplacementCase(matchedText, issue.suggestion)

        node.nodeValue =
          text.substring(0, index) +
          replacement +
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

    if (autoFormatTimer.current) {
      clearTimeout(autoFormatTimer.current)
    }
  }
}, [])

  // const getEditorText = useCallback(() => editorRef.current?.innerText || '', [])
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
              to="/dashboard"
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
        <EditorPages
          editorRef={editorRef}
          content={content}
          onContentChange={handleContentChange}
          grammarIssues={grammarIssues}
          onGrammarApply={handleGrammarApply}
          onGrammarDismiss={handleGrammarDismiss}
        />

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
                    onDismiss={() => handlePromptReject()}
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

                {/* Grammar auto-check (panel hidden) */}
                <GrammarPanel
                  text={content}
                  activeIssues={grammarIssues}
                  onCheckComplete={setGrammarIssues}
                  autoCheck
                  autoCheckDelayMs={2500}
                  autoCheckCooldownMs={12000}
                  showPanel={false}
                />

                {/* Session stats */}
                <div
                  style={{
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    padding: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <p
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--muted-foreground)',
                        margin: 0,
                      }}
                    >
                      Session
                    </p>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault()
                        void loadBehaviorSummary()
                      }}
                      disabled={behaviorSummaryLoading}
                      style={{
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        color: 'var(--muted-foreground)',
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: behaviorSummaryLoading ? 'not-allowed' : 'pointer',
                        opacity: behaviorSummaryLoading ? 0.5 : 1,
                        padding: 0,
                        fontFamily: 'inherit',
                      }}
                    >
                      {behaviorSummaryLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>Words</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{wordCount}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>Behavior events</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>{behaviorSummary?.totalEvents ?? 0}</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.625rem' }}>
                    <div style={{ borderRadius: '0.375rem', backgroundColor: 'var(--secondary)', padding: '0.625rem' }}>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>
                        Accepted
                      </p>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: '#10b981', margin: 0 }}>
                        {countBehaviorBucket(behaviorSummary?.chatPreviewAccepted)}
                      </p>
                    </div>
                    <div style={{ borderRadius: '0.375rem', backgroundColor: 'var(--secondary)', padding: '0.625rem' }}>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: '0 0 0.25rem' }}>
                        Rejected
                      </p>
                      <p style={{ fontSize: '1rem', fontWeight: 600, color: '#ff5b4f', margin: 0 }}>
                        {countBehaviorBucket(behaviorSummary?.chatPreviewRejected)}
                      </p>
                    </div>
                  </div>

                  {behaviorSummary && behaviorSummary.latestEvents.length > 0 ? (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                      <p style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', margin: '0 0 0.5rem' }}>
                        Latest feedback
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {behaviorSummary.latestEvents.slice(0, 3).map((event) => (
                          <div key={`${event.action}-${event.timestamp}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {event.action}
                            </span>
                            <span style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', flexShrink: 0 }}>
                              {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <McpDebugPanel documentId={id} documentContent={chatContent} />

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
          documentContent={chatContent}
          onFormatApplied={handleFormat}
          onFocusEditor={focusEditor}
          onFeedbackLogged={() => void loadBehaviorSummary()}
        />
      </div>
    </div>
  )
}
