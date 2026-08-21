import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { api, type BehaviorSummaryResponse, type PageNumberFormat } from '@/services/api'
import {
  TiptapToolbar,
  type Editor,
  type PageSizeKey,
  type PageOrientation,
  type MarginValues,
} from '@/components/editor/TiptapEditor'
import { PagedEditor } from '@/components/editor/PagedEditor'
import {
  type BehaviorEvent,
  createBehaviorEvent,
} from '@/components/editor/behaviorListener'
import SuggestionPanel, { type Suggestion } from '@/components/editor/SuggestionPanel'
import GrammarPanel, { type GrammarIssue } from '@/components/editor/GrammarPanel'
import GrammarOverlay from '@/components/editor/GrammarOverlay'
import FormatPrompt, { type FormatSuggestion } from '@/components/editor/FormatPrompt'
import AIChatbot from '@/components/editor/AIChatbot'
import FormattingPanel from '@/components/editor/FormattingPanel'
import McpDebugPanel from '@/components/editor/McpDebugPanel'

import { useTheme } from '@/context/ThemeContext'

import { ArrowLeft, Save, Moon, Sun, ShieldOff, Shield } from 'lucide-react'

const AUTOSAVE_DELAY = 8000
/** Consecutive failed autosaves before giving up until the next edit. */
const MAX_SAVE_RETRIES = 3

const AUTO_FORMAT_DELAY = 1800
const AUTO_FORMAT_CONFIDENCE_THRESHOLD = 0.7
const AUTO_FORMAT_SUPPRESSION_MS = 5 * 60 * 1000
const AUTO_FORMAT_MIN_INTERVAL_MS = 30 * 1000

export default function Document(): JSX.Element {
  const { id } = useParams()

  // ── TipTap editor — the currently focused page editor, reported by the
  //    paginated view. Toolbar, grammar, suggestions and AI act on it.
  const [editor, setEditor] = useState<Editor | null>(null)

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef<boolean>(false)
  const latestTitleRef = useRef<string>('Untitled Document')
  const latestContentRef = useRef<string>('')
  const latestFormatHistoryRef = useRef<string[]>([])
  const pendingSaveRef = useRef<boolean>(false)
  const saveRetryCountRef = useRef<number>(0)
  const autoFormatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressedAutoFormatsRef = useRef<Record<string, number>>({})
  const lastAutoFormatRef = useRef<{format: string; shownAt: number} | null>(null)

  const [title, setTitle] = useState<string>('Untitled Document')
  const [content, setContent] = useState<string>('')
  const latestHeaderRef = useRef<string>('')
  const latestFooterRef = useRef<string>('')
  const [headerContent, setHeaderContent] = useState<string>('')
  const [footerContent, setFooterContent] = useState<string>('')
  const [showHeader, setShowHeader] = useState<boolean>(false)
  const [showFooter, setShowFooter] = useState<boolean>(false)
  const [headerNumberFormat, setHeaderNumberFormat] = useState<PageNumberFormat>('none')
  const [footerNumberFormat, setFooterNumberFormat] = useState<PageNumberFormat>('none')
  const latestHeaderSettingsRef = useRef({
    showHeader: false,
    showFooter: false,
    headerNumberFormat: 'none' as PageNumberFormat,
    footerNumberFormat: 'none' as PageNumberFormat,
  })
  const [_lastSavedTitle, setLastSavedTitle] = useState<string>('Untitled Document')
  const [_lastSavedContent, setLastSavedContent] = useState<string>('')
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [wordCount, setWordCount] = useState<number>(0)
  const [formatHistory, setFormatHistory] = useState<string[]>([])
  const [_behaviorEvents, setBehaviorEvents] = useState<BehaviorEvent[]>([])
  const [behaviorSummary, setBehaviorSummary] = useState<BehaviorSummaryResponse | null>(null)
  const [behaviorSummaryLoading, setBehaviorSummaryLoading] = useState<boolean>(false)

  /* ── Page layout state ─────────────────────────────────────────────── */
  const [pageSize, setPageSize] = useState<PageSizeKey>('short')
  const [margins, setMargins] = useState<MarginValues>({ top: 1, bottom: 1, left: 1.5, right: 1 })
  const [orientation, setOrientation] = useState<PageOrientation>('portrait')
  const latestPageSetupRef = useRef({
    pageSize: 'short' as PageSizeKey,
    margins: { top: 1, bottom: 1, left: 1.5, right: 1 } as MarginValues,
    orientation: 'portrait' as PageOrientation,
  })

  const [rightPanelOpen] = useState<boolean>(true)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const [formatPrompt, setFormatPrompt] = useState<FormatSuggestion | null>(null)
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([])
  const [activeGrammarIssue, setActiveGrammarIssue] = useState<GrammarIssue | null>(null)
  const [activeGrammarRect, setActiveGrammarRect] = useState<DOMRect | null>(null)
  const [isIsolated, setIsIsolated] = useState<boolean>(false)
  const [formattingPreset, setFormattingPreset] = useState<string | null>(null)

  const chatContent = buildAiDocumentContext(content)

  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    if (!id) return
    async function loadDocument(): Promise<void> {
      try {
        const doc = await api.documents.get(id as string)
        const nextTitle = doc.title || 'Untitled Document'
        const nextContent = doc.content || ''
        const nextHeader = doc.header_content || ''
        const nextFooter = doc.footer_content || ''
        setTitle(nextTitle)
        setContent(nextContent)
        latestHeaderRef.current = nextHeader
        latestFooterRef.current = nextFooter
        setHeaderContent(nextHeader)
        setFooterContent(nextFooter)
        setShowHeader(doc.show_header ?? false)
        setShowFooter(doc.show_footer ?? false)
        setHeaderNumberFormat(doc.header_number_format ?? 'none')
        setFooterNumberFormat(doc.footer_number_format ?? 'none')
        latestHeaderSettingsRef.current = {
          showHeader: doc.show_header ?? false,
          showFooter: doc.show_footer ?? false,
          headerNumberFormat: doc.header_number_format ?? 'none',
          footerNumberFormat: doc.footer_number_format ?? 'none',
        }
        const nextPageSize = doc.page_size ?? 'short'
        const nextMargins = doc.margins ?? { top: 1, bottom: 1, left: 1.5, right: 1 }
        const nextOrientation = doc.orientation ?? 'portrait'
        setPageSize(nextPageSize)
        setMargins(nextMargins)
        setOrientation(nextOrientation)
        latestPageSetupRef.current = {
          pageSize: nextPageSize,
          margins: nextMargins,
          orientation: nextOrientation,
        }
        latestTitleRef.current = nextTitle
        latestContentRef.current = nextContent
        setLastSavedTitle(nextTitle)
        setLastSavedContent(nextContent)
        setSaveStatus('saved')
        updateWordCount(nextContent)
        setIsIsolated(doc.is_isolated ?? false)
        setFormattingPreset(doc.formatting_preset ?? null)
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

  /**
   * Build a compact, bounded document context for the AI assistant so large
   * documents never flood the provider context window. Includes the opening
   * excerpt, a heading outline, and a note telling the user they can fetch a
   * specific page via `/mcp getDocumentContent`.
   */
  function buildAiDocumentContext(html: string): string {
    const plainText = getPlainText(html)
    const words = plainText.match(/\b[\w']+\b/g) ?? []
    const outline = Array.from(
      html.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi),
      (match) => match[1].replace(/<[^>]*>/g, '').trim()
    ).filter((heading) => heading.length > 0)

    const excerpt = plainText.slice(0, 4000)
    const outlineBlock =
      outline.length > 0
        ? `\n\nDocument outline:\n- ${outline.slice(0, 20).join('\n- ')}`
        : ''
    const truncatedNote =
      plainText.length > 4000
        ? '\n\n[Content truncated. Ask the user to run: /mcp getDocumentContent documentId=YOUR_ID page=1]'
        : ''
    return `${excerpt}${outlineBlock}\n\nWord count: ${words.length}${truncatedNote}`
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


  function applyPromptFormat(format: string): void {
    if (!editor) return
    switch (format) {
      case 'bold':          editor.chain().focus().toggleBold().run(); break
      case 'italic':        editor.chain().focus().toggleItalic().run(); break
      case 'underline':     editor.chain().focus().toggleUnderline().run(); break
      case 'strikethrough': editor.chain().focus().toggleStrike().run(); break
      case 'heading1': case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break
      case 'heading2': case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break
      case 'heading3': case 'h3': editor.chain().focus().toggleHeading({ level: 3 }).run(); break
      case 'unordered_list': case 'ul': editor.chain().focus().toggleBulletList().run(); break
      case 'ordered_list': case 'ol': editor.chain().focus().toggleOrderedList().run(); break
      case 'blockquote':    editor.chain().focus().toggleBlockquote().run(); break
      default: break
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
    const plainText = getPlainText(nextContent).slice(0, 50000)

    if (plainText.length < 12) {
      setFormatPrompt(null)
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    try {
      const result = await api.formatting.tierCheck(plainText, id ?? '')

      // Tier 1/2 — preset rule or custom binding: apply immediately.
      if (result.tier === 'binding' || result.tier === 'preset') {
        if (result.format) {
          applyPromptFormat(result.format)
          handleFormat(result.format)
        }
        setFormatPrompt(null)
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // Tier 3 — ML prediction with confidence score.
      if (result.tier !== 'ml' || !result.format || result.confidence === undefined) {
        setFormatPrompt(null)
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      const predictedFormat = result.format
      const confidence = result.confidence

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
    saveRetryCountRef.current = 0
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
    // Read the latest content from the cache kept fresh by every page edit
    const nextContent = latestContentRef.current
    const nextFormatHistory = latestFormatHistoryRef.current

    savingRef.current = true
    pendingSaveRef.current = false
    setSaveStatus('saving')

    try {
      await api.documents.update(id, {
        title: nextTitle,
        content: nextContent,
        header_content: latestHeaderRef.current,
        footer_content: latestFooterRef.current,
        show_header: latestHeaderSettingsRef.current.showHeader,
        show_footer: latestHeaderSettingsRef.current.showFooter,
        header_number_format: latestHeaderSettingsRef.current.headerNumberFormat,
        footer_number_format: latestHeaderSettingsRef.current.footerNumberFormat,
        page_size: latestPageSetupRef.current.pageSize,
        margins: latestPageSetupRef.current.margins,
        orientation: latestPageSetupRef.current.orientation,
        formatting_history: nextFormatHistory,
      })
      latestContentRef.current = nextContent
      setContent(nextContent)
      setLastSavedTitle(nextTitle)
      setLastSavedContent(nextContent)
      saveRetryCountRef.current = 0
      setSaveStatus('saved')
    } catch (error) {
      console.error('Autosave failed', error)
      // Give up after a few consecutive failures instead of retrying forever.
      saveRetryCountRef.current += 1
      if (saveRetryCountRef.current >= MAX_SAVE_RETRIES) {
        pendingSaveRef.current = false
        setSaveStatus('error')
      } else {
        pendingSaveRef.current = true
        setSaveStatus('unsaved')
      }
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

  function handleHeaderChange(value: string): void {
    latestHeaderRef.current = value
    setHeaderContent(value)
    scheduleSave()
  }

  function handleFooterChange(value: string): void {
    latestFooterRef.current = value
    setFooterContent(value)
    scheduleSave()
  }

  function handleShowHeaderChange(value: boolean): void {
    latestHeaderSettingsRef.current.showHeader = value
    setShowHeader(value)
    scheduleSave()
  }

  function handleShowFooterChange(value: boolean): void {
    latestHeaderSettingsRef.current.showFooter = value
    setShowFooter(value)
    scheduleSave()
  }

  function handleHeaderNumberFormatChange(value: PageNumberFormat): void {
    latestHeaderSettingsRef.current.headerNumberFormat = value
    setHeaderNumberFormat(value)
    scheduleSave()
  }

  function handleFooterNumberFormatChange(value: PageNumberFormat): void {
    latestHeaderSettingsRef.current.footerNumberFormat = value
    setFooterNumberFormat(value)
    scheduleSave()
  }

  function handlePageSizeChange(value: PageSizeKey): void {
    latestPageSetupRef.current.pageSize = value
    setPageSize(value)
    scheduleSave()
  }

  function handleMarginsChange(value: MarginValues): void {
    latestPageSetupRef.current.margins = value
    setMargins(value)
    scheduleSave()
  }

  function handleOrientationChange(value: PageOrientation): void {
    latestPageSetupRef.current.orientation = value
    setOrientation(value)
    scheduleSave()
  }

  function handleFormat(formatType: string): void {
    const nextContent = latestContentRef.current
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

      api.ai
        .logFeedback({
          documentId: id,
          predictionType: 'format_prompt',
          predictedFormat: format,
          confidence: formatPrompt?.confidence,
          accepted: true,
        })
        .catch((error) => console.error('Format prompt acceptance feedback failed', error))
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

      api.ai
        .logFeedback({
          documentId: id,
          predictionType: 'format_prompt',
          predictedFormat: format,
          confidence: formatPrompt?.confidence,
          accepted: false,
        })
        .catch((error) => console.error('Format prompt rejection feedback failed', error))
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
    if (!editor) return

    function preserveReplacementCase(originalText: string, suggestion: string): string {
      if (!originalText || !suggestion) return suggestion
      if (originalText === originalText.toUpperCase()) return suggestion.toUpperCase()
      if (originalText[0] === originalText[0].toUpperCase())
        return suggestion[0].toUpperCase() + suggestion.slice(1)
      return suggestion
    }

    // Apply grammar fix via TipTap's transaction system
    const { state, dispatch } = editor.view
    const { doc, tr } = state
    const needle = issue.original.toLowerCase()
    let applied = false

    doc.descendants((node, pos) => {
      if (applied || node.type.name !== 'text') return
      const text = node.text ?? ''
      const idx = text.toLowerCase().indexOf(needle)
      if (idx !== -1) {
        const matchedText = text.substring(idx, idx + issue.original.length)
        const replacement = preserveReplacementCase(matchedText, issue.suggestion)
        tr.replaceWith(pos + idx, pos + idx + issue.original.length, state.schema.text(replacement))
        applied = true
      }
    })

    if (applied) dispatch(tr)
    setGrammarIssues((prev) => prev.filter((i) => i !== issue))
  }

  function handleGrammarDismiss(issue: GrammarIssue): void {
    setGrammarIssues((prev) => prev.filter((i) => i !== issue))
    setActiveGrammarIssue((active) => (active === issue ? null : active))
  }

  // Push grammar issues into the editor's wavy-underline decorations whenever they change.
  useEffect(() => {
    if (!editor || !editor.commands.setGrammarIssues) return
    editor.commands.setGrammarIssues(grammarIssues)
  }, [editor, grammarIssues])

  // Open the click-anchored popover when the user clicks a wavy underline.
  // Grammar-underline clicks are forwarded from every page editor by the
  // paginated view.

  // Close the popover when its issue is removed from the active set.
  useEffect(() => {
    if (!activeGrammarIssue) return
    if (!grammarIssues.includes(activeGrammarIssue)) {
      setActiveGrammarIssue(null)
      setActiveGrammarRect(null)
    }
  }, [grammarIssues, activeGrammarIssue])

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
  /** Focus the editor via TipTap's native focus command. */
  function focusEditor(): void {
    editor?.chain().focus().run()
  }

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
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : saveStatus === 'error' ? 'Save failed' : 'Saved'}
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

            <button
              type="button"
              onClick={() => {
                if (!id) return
                const next = !isIsolated
                setIsIsolated(next)
                api.documents.toggleIsolation(id, next).catch((err) => {
                  console.error('Toggle isolation failed', err)
                  setIsIsolated(!next)
                })
              }}
              title={isIsolated ? 'Document is isolated — behavioral data is NOT being collected. Click to resume learning.' : 'Document is NOT isolated — behavioral data is being collected. Click to isolate.'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '0.5rem',
                border: 'none',
                boxShadow: '0 0 0 1px var(--border-shadow)',
                backgroundColor: isIsolated ? 'hsl(0, 60%, 95%)' : 'transparent',
                color: isIsolated ? 'hsl(0, 70%, 50%)' : 'var(--muted-foreground)',
                cursor: 'pointer',
                transition: 'background-color 150ms, color 150ms',
              }}
              onMouseEnter={(e) => {
                if (!isIsolated) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--secondary)'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--foreground)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isIsolated) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--muted-foreground)'
                }
              }}
            >
              {isIsolated ? <ShieldOff style={{ width: '14px', height: '14px' }} strokeWidth={1.5} /> : <Shield style={{ width: '14px', height: '14px' }} strokeWidth={1.5} />}
            </button>
          </div>
        </div>

        {/* Toolbar row — overflow visible with z-index so popovers float above canvas */}
        <div style={{ borderTop: '1px solid var(--border)', position: 'relative', zIndex: 100 }}>
          <TiptapToolbar
            editor={editor ?? null}
            documentTitle={title}
            onFormatApplied={handleFormat}
            pageSize={pageSize}
            onPageSizeChange={handlePageSizeChange}
            margins={margins}
            onMarginsChange={handleMarginsChange}
            orientation={orientation}
            onOrientationChange={handleOrientationChange}
            onImportComplete={(importedHtml, importedTitle, layout) => {
              if (importedTitle) setTitle(importedTitle)
              if (layout) {
                latestPageSetupRef.current = {
                  pageSize: layout.pageSize ?? latestPageSetupRef.current.pageSize,
                  margins: layout.margins ?? latestPageSetupRef.current.margins,
                  orientation: layout.orientation ?? latestPageSetupRef.current.orientation,
                }
                setPageSize(latestPageSetupRef.current.pageSize)
                setMargins(latestPageSetupRef.current.margins)
                setOrientation(latestPageSetupRef.current.orientation)
                if (layout.headerContent !== undefined) {
                  latestHeaderRef.current = layout.headerContent
                  setHeaderContent(layout.headerContent)
                }
                if (layout.footerContent !== undefined) {
                  latestFooterRef.current = layout.footerContent
                  setFooterContent(layout.footerContent)
                }
              }
              handleContentChange(importedHtml)
            }}
            headerContent={headerContent}
            footerContent={footerContent}
            onHeaderChange={handleHeaderChange}
            onFooterChange={handleFooterChange}
            showHeader={showHeader}
            showFooter={showFooter}
            onShowHeaderChange={handleShowHeaderChange}
            onShowFooterChange={handleShowFooterChange}
            headerNumberFormat={headerNumberFormat}
            footerNumberFormat={footerNumberFormat}
            onHeaderNumberFormatChange={handleHeaderNumberFormatChange}
            onFooterNumberFormatChange={handleFooterNumberFormatChange}
          />
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Editor area — clean TipTap paper sheet */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--canvas-bg)', padding: '2rem 1rem' }}>
            <PagedEditor
              content={content}
              onContentChange={handleContentChange}
              onActiveEditorChange={setEditor}
              onGrammarClick={(issue, rect) => {
                setActiveGrammarIssue(issue)
                setActiveGrammarRect(rect)
              }}
              grammarIssues={grammarIssues}
              pageSize={pageSize}
              margins={margins}
              orientation={orientation}
              showHeader={showHeader}
              showFooter={showFooter}
              headerContent={headerContent}
              footerContent={footerContent}
              headerNumberFormat={headerNumberFormat}
              footerNumberFormat={footerNumberFormat}
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

                {/* Grammar & spell check — engine only; issues render in the
                    floating GrammarOverlay over the document */}
                <GrammarPanel
                  text={content}
                  activeIssues={grammarIssues}
                  onCheckComplete={setGrammarIssues}
                  onApply={handleGrammarApply}
                  onDismiss={handleGrammarDismiss}
                  autoCheck
                  autoCheckDelayMs={2500}
                  autoCheckCooldownMs={12000}
                  showPanel={false}
                />

                {/* Formatting preset + custom rules (Tier 1 & 2) */}
                <FormattingPanel
                  documentId={id}
                  activePreset={formattingPreset}
                  onPresetChange={setFormattingPreset}
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

      {/* Grammar & spell check — floating popover anchored to a clicked wavy underline */}
      <GrammarOverlay
        issue={activeGrammarIssue}
        anchorRect={activeGrammarRect}
        onApply={handleGrammarApply}
        onDismiss={handleGrammarDismiss}
        onClose={() => {
          setActiveGrammarIssue(null)
          setActiveGrammarRect(null)
        }}
      />

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
          editor={editor ?? null}
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
