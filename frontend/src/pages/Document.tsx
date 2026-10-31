import { useEffect, useRef, useState, useCallback, useMemo, type ChangeEvent } from 'react'
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { api, type DocumentRecord, type PageNumberFormat, type TierCheckResponse } from '@/services/api'
import {
  TiptapToolbar,
  type Editor,
  type PageSizeKey,
  type PageOrientation,
  type MarginValues,
  type HeaderFooterConfig,
  type HeaderFooterPlacement,
} from '@/components/editor/TiptapEditor'
import { PagedEditor } from '@/components/editor/PagedEditor'
import { LogoLockup } from '@/components/Logo'
import {
  type BehaviorEventPayload,
  createBehaviorEvent,
} from '@/components/editor/behaviorListener'
import type { GrammarIssue } from '@/components/editor/GrammarPanel'
import type { Suggestion } from '@/components/editor/SuggestionPanel'
import GrammarOverlay from '@/components/editor/GrammarOverlay'
import InlineSuggestionChip from '@/components/editor/InlineSuggestionChip'
import TwoColumnPrompt from '@/components/TwoColumnPrompt'
import DocumentTypePrompt from '@/components/DocumentTypePrompt'
import { IeeePrintPreview } from '@/components/editor/IeeePrintPreview'
import SuggestionActionsMenu from '@/components/editor/SuggestionActionsMenu'
import { type FormatSuggestion } from '@/components/editor/FormatPrompt'
import EditorSidePanel, { type SidePanelTab } from '@/components/editor/EditorSidePanel'
import { ACADEMIC_PRESETS, basePresetKey } from '@/components/editor/academicPresets'
import { hasDriftedFromPreset } from '@/components/editor/documentBlueprints'
import PresetForkPrompt from '@/components/PresetForkPrompt'
import { applyStyleCommand } from '@/components/editor/styleCommands'
import WordProgress from '@/components/editor/WordProgress'
import DocumentZoomWidget, { clampZoom, ZOOM_STEP } from '@/components/editor/DocumentZoomWidget'
import { PAGE_SIZES } from '@/components/editor/HeaderFooterPlugin'
import { useAuth } from '@/hooks/useAuth'
import ShareModal from '@/components/ShareModal'
import PersonalizationProfileModal from '@/components/editor/PersonalizationProfileModal'
import { ArrowLeft, ShieldCheck, ShieldOff, Shield, PanelRight, PanelRightClose, Share2, PanelLeft, PanelLeftClose } from 'lucide-react'
import { useGrammarCheck } from '@/hooks/useGrammarCheck'
import { useAutoFormatScanner, classifyStructuralRole, type ScannerSuggestion } from '@/hooks/useAutoFormatScanner'
import { describeBlock, isFormatSatisfied, isTitleCandidate } from '@/lib/formatSatisfied'
import { buildStyleProfile, documentStyleOverrides } from '@/lib/documentStyleProfile'
import type { PageLayoutData } from '@/lib/pageLayout'
import { dismissFontNotice, fontFamiliesIn, fontNoticeDismissed, missingFonts } from '@/lib/fontAvailability'
import { findHeadingPosition } from '@/components/editor/OutlineNavigator'
import { extractTOCFromHTML } from '@/components/editor/TableOfContents'
import type { TOCEntry } from '@/components/editor/TableOfContents'
import { OutlineNavigator } from '@/components/editor/OutlineNavigator'
import { CitationAssistant } from '@/components/editor/CitationAssistant'
import HelpSheet from '@/components/editor/HelpSheet'
import { CITATION_STYLE_LABELS, type CitationData, type CitationNumberMap, type CitationReference, type CitationStyle } from '@/lib/citationFormats'
import DocumentPartsPanel from '@/components/editor/DocumentPartsPanel'
import { buildReferenceNodes, insertOrUpdateGenerated, pageNumberAt, referencesHeadingEnd } from '@/components/editor/DocumentParts'
import { OfflineIndicator } from '@/components/editor/OfflineIndicator'
import { useOfflineSync } from '@/hooks/useOfflineBuffer'
import { useEditorPreferences } from '@/hooks/useEditorPreferences'
import { confidenceThreshold, highlightColorCss, setEditorPreferences } from '@/lib/editorPreferences'
import { readFormatSnapshot } from '@/lib/formatSnapshot'
import { clearLocalDraft, readLocalDraft, writeLocalDraft, type LocalDraft } from '@/lib/localDraft'
import {
  cacheDocumentRead,
  evictCachedDocument,
  getCachedDocumentRead,
} from '@/hooks/useDocumentCache'
import { supabase } from '@/lib/supabase'
import { type RealtimeChannel } from '@supabase/supabase-js'

const AUTOSAVE_DELAY = 3000
const MAX_SAVE_RETRIES = 3

// Darkened 700-level hues so the white 10px initials meet WCAG AA (4.5:1).
const AVATAR_COLORS = [
  '#b91c1c', '#1d4ed8', '#047857', '#b45309',
  '#6d28d9', '#be185d', '#0e7490', '#4d7c0f',
]

/** Deterministic avatar color for a collaborator. */
function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/** Two-letter initials for an avatar circle. */
function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Live content snapshot broadcast on a document channel. */
interface DocSyncPayload {
  content: string
  title?: string
  header_content?: string
  footer_content?: string
  sender_id: string
  timestamp: number
}

/** Presence-tracked collaborator entry. */
interface RemotePresence {
  user_id: string
  display_name: string
  color: string
  updated_at: number
}

const AUTO_FORMAT_DELAY = 1200
const AUTO_FORMAT_CONFIDENCE_THRESHOLD = 0.22
const AUTO_FORMAT_SUPPRESSION_MS = 5 * 60 * 1000

/** Where a chip suggestion came from, for the popup badge. */
function describeSuggestionSource(prompt: { suggestionSource?: string; formatGroup?: string }): 'learned' | 'preset' | 'ml' | 'scanner' {
  if (prompt.suggestionSource === 'learned') return 'learned'
  if (prompt.formatGroup?.startsWith('blueprint-')) return 'preset'
  if (prompt.suggestionSource === 'ml') return 'ml'
  return 'scanner'
}

/** One plain sentence explaining why a chip suggestion is offered. */
function describeSuggestionReason(prompt: { suggestionSource?: string; formatGroup?: string; groupMembers?: unknown[] }): string {
  if (prompt.suggestionSource === 'learned') return 'You formatted matching text this way before, so IntelliDocs is offering the same look here.'
  if (prompt.formatGroup?.startsWith('blueprint-')) return 'Your document type has a standard style for this part, and a few blocks do not match it yet.'
  if (prompt.formatGroup) return 'Blocks that play the same role in your document are styled differently.'
  if (prompt.suggestionSource === 'ml') return 'Predicted from how similar documents are laid out.'
  return 'This line looks like it should be formatted this way, based on its wording and position.'
}

/** CSS that draws a suggestion's look on the page, or null when it cannot be drawn as a style. */
function suggestionPreviewStyle(prompt: {
  format: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number | null
  textAlign?: string
}): { inlineStyle: string; blockStyle: string } | null {
  const inline: string[] = []
  const block: string[] = []
  if (prompt.bold) inline.push('font-weight:700')
  if (prompt.italic) inline.push('font-style:italic')
  if (prompt.underline) inline.push('text-decoration:underline')
  if (typeof prompt.fontSize === 'number' && prompt.fontSize > 0) inline.push(`font-size:${prompt.fontSize}pt`)
  if (prompt.textAlign) block.push(`text-align:${prompt.textAlign}`)
  switch (prompt.format) {
    case 'bold': inline.push('font-weight:700'); break
    case 'italic': inline.push('font-style:italic'); break
    case 'underline': inline.push('text-decoration:underline'); break
    case 'heading1': case 'h1': inline.push('font-size:20pt', 'font-weight:700'); break
    case 'heading2': case 'h2': inline.push('font-size:16pt', 'font-weight:700'); break
    case 'heading3': case 'h3': inline.push('font-size:14pt', 'font-weight:700'); break
    case 'title': inline.push('font-size:22pt', 'font-weight:700'); block.push('text-align:center'); break
    default: break
  }
  if (inline.length === 0 && block.length === 0) return null
  return { inlineStyle: inline.join(';'), blockStyle: block.join(';') }
}

/** Show the model's real confidence as a whole percent (never rescaled upward). */
function confidenceToPercent(confidence: number): number {
  return Math.min(99, Math.max(1, Math.round(confidence * 100)))
}

/** Key that remembers a rejected suggestion for one piece of text, so it is not re-offered. */
function suppressionKey(format: string, text: string): string {
  return `${format}::${text.trim().toLowerCase()}`
}

/** Char delta in one editor update treated as a bulk insertion (paste). */
const COMPOSITION_PASTE_MIN_CHARS = 50

/** Char delta in one editor update treated as a bulk deletion. */
const COMPOSITION_DELETE_MIN_CHARS = 20

/** How long typed characters accumulate before one 'type' event is logged. */
const COMPOSITION_TYPING_FLUSH_MS = 15_000

/** Ignore composition deltas right after a document load (hydration window). */
const COMPOSITION_LOAD_SUPPRESS_MS = 5_000

export default function Document(): JSX.Element {
  const { id } = useParams()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  // `?readonly=1` is used when opening a trash document (view only).
  // `?share=TOKEN` grants read-only access to non-owners via a share link.
  const shareToken = searchParams.get('share') ?? undefined
  const [viewOnly, setViewOnly] = useState<boolean>(false)
  const readOnly = searchParams.get('readonly') === '1' || viewOnly
  const [docOwnerId, setDocOwnerId] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState<boolean>(false)
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false)
  const docChannelRef = useRef<RealtimeChannel | null>(null)
  const [remotePresence, setRemotePresence] = useState<Map<string, RemotePresence>>(new Map())

  const [editor, setEditor] = useState<Editor | null>(null)

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef<boolean>(false)
  /**
   * True only once the server copy of this document has been applied. The
   * "latest" refs below start as 'Untitled Document' / '' and the empty editor
   * emits an update on mount, so a save before the load finishes would write
   * those defaults over the real document (it did, whenever the fetch took
   * longer than AUTOSAVE_DELAY). Nothing is saved while this is false.
   */
  const documentLoadedRef = useRef<boolean>(false)
  const latestTitleRef = useRef<string>('Untitled Document')
  const latestContentRef = useRef<string>('')
  const latestFormatHistoryRef = useRef<string[]>([])
  const pendingSaveRef = useRef<boolean>(false)
  const saveRetryCountRef = useRef<number>(0)
  const autoFormatTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressedAutoFormatsRef = useRef<Record<string, number>>({})
  // Set while a grammar/spelling replacement dispatches its own transaction.
  // The resulting content change must not re-trigger auto-formatting (especially
  // the auto-apply tier) — fixing a typo should never reformat the paragraph.
  const suppressAutoFormatRef = useRef<boolean>(false)
  // Composition telemetry for timeline forensics: plain-text length bookkeeping
  // (never text content), pending typed characters, and a load-suppress window.
  const compositionRef = useRef({ lastTextLength: 0, pendingTypedChars: 0, suppressUntil: 0 })
  const compositionFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [headerPlacement, setHeaderPlacement] = useState<HeaderFooterPlacement>('split')
  const [footerPlacement, setFooterPlacement] = useState<HeaderFooterPlacement>('split')
  const [headerMarginIn, setHeaderMarginIn] = useState<number>(0.5)
  const [footerMarginIn, setFooterMarginIn] = useState<number>(0.5)
  const [differentFirstPage, setDifferentFirstPage] = useState<boolean>(false)
  const [pageLayout, setPageLayout] = useState<PageLayoutData | null>(null)
  // Fonts the document names that this computer lacks (the notice is dismissed per document).
  const [missingDocFonts, setMissingDocFonts] = useState<string[]>([])
  const latestHeaderSettingsRef = useRef({
    showHeader: false,
    showFooter: false,
    headerNumberFormat: 'none' as PageNumberFormat,
    footerNumberFormat: 'none' as PageNumberFormat,
  })
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  // True while the server refuses saves because the account is out of storage.
  const [storageFull, setStorageFull] = useState(false)
  /** Unsaved edits from an earlier session that are newer than the server copy. */
  const [recoveredDraft, setRecoveredDraft] = useState<LocalDraft | null>(null)
  const [helpOpen, setHelpOpen] = useState<boolean>(false)
  /** Spoken to screen readers after an accept, fix or dismiss, which otherwise change the page silently. */
  const [announcement, setAnnouncement] = useState<string>('')
  // The slash menu's /help command asks for the sheet through a window event.
  useEffect(() => {
    const open = (): void => setHelpOpen(true)
    window.addEventListener('intellidocs:open-help', open)
    return () => window.removeEventListener('intellidocs:open-help', open)
  }, [])
  const [wordCount, setWordCount] = useState<number>(0)
  const [formatHistory, setFormatHistory] = useState<string[]>([])

  /* ── Page layout state ─────────────────────────────────────────────── */
  const [pageSize, setPageSize] = useState<PageSizeKey>('short')
  const [margins, setMargins] = useState<MarginValues>({ top: 1, bottom: 1, left: 1.5, right: 1 })
  const [orientation, setOrientation] = useState<PageOrientation>('portrait')
  const latestPageSetupRef = useRef({
    pageSize: 'short' as PageSizeKey,
    margins: { top: 1, bottom: 1, left: 1.5, right: 1 } as MarginValues,
    orientation: 'portrait' as PageOrientation,
  })

  /** Phones and small tablets: panels start closed and the assistant is a bottom sheet. */
  const [isNarrow, setIsNarrow] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const onChange = (event: MediaQueryListEvent): void => setIsNarrow(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches)
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('assistant')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false)
  const [formatPrompt, setFormatPrompt] = useState<FormatSuggestion | null>(null)
  const [previewMode, setPreviewMode] = useState<'before' | 'after'>('after')
  // Learned-format match awaiting a click: highlight only, popup opens on click.
  const [pendingLearnedFormat, setPendingLearnedFormat] = useState<FormatSuggestion | null>(null)
  const [grammarIssues, setGrammarIssues] = useState<GrammarIssue[]>([])
  const [activeGrammarIssue, setActiveGrammarIssue] = useState<GrammarIssue | null>(null)
  const [activeGrammarRect, setActiveGrammarRect] = useState<DOMRect | null>(null)
  const [suggestionRange, setSuggestionRange] = useState<{ from: number; to: number } | null>(null)
  const [suggestionAnchor, setSuggestionAnchor] = useState<{ x: number; y: number } | null>(null)
  /** Spotlight rect (canvas-relative px) shown briefly after an outline jump. */
  const [flashCoords, setFlashCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [flashKey, setFlashKey] = useState<number>(0)
  const flashTimerRef = useRef<number | null>(null)
  const [actionsMenu, setActionsMenu] = useState<{ x: number; y: number } | null>(null)
  const editorCanvasRef = useRef<HTMLDivElement>(null)
  const [isIsolated, setIsIsolated] = useState<boolean>(false)
  const [formattingPreset, setFormattingPreset] = useState<string | null>(null)
  const [spreadPreview, setSpreadPreview] = useState<boolean>(false)
  const isIeeePreset = basePresetKey(formattingPreset) === 'ieee'
  // The two-page spread is an IEEE view; leave it when the document stops being IEEE.
  useEffect(() => {
    if (!isIeeePreset) setSpreadPreview(false)
  }, [isIeeePreset])
  // Captions read "Fig. 1" / "TABLE I" in IEEE documents. Opening a document only sets the
  // style; labels are rewritten when the user switches preset, never just by opening.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.storage.captions.labelStyle = isIeeePreset ? 'ieee' : 'default'
  }, [editor, isIeeePreset])
  /** Visual canvas zoom (1 = 100%). Layout and pagination are unaffected. */
  const [zoomLevel, setZoomLevel] = useState<number>(1)
  /** Latest zoom value for listeners bound with empty dependency lists. */
  const zoomLevelRef = useRef<number>(1)
  zoomLevelRef.current = zoomLevel
  /** Non-printing alignment gridlines over each page's text area. */
  const [showGridlines, setShowGridlines] = useState<boolean>(false)
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('ieee')
  const [references, setReferences] = useState<CitationReference[]>([])
  /** The citation data last loaded from or saved to the server, as JSON; edits are compared against it. */
  const savedCitationsRef = useRef<string | null>(null)
  const referencesKey = id ? `intellidocs.references.${id}` : null

  // A copy kept in this browser covers the time before the server copy loads, and
  // servers that have not applied the citation migration yet.
  useEffect(() => {
    if (!referencesKey) return
    try {
      const raw = localStorage.getItem(referencesKey)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<CitationData>
      if (Array.isArray(saved.references)) setReferences(saved.references)
      if (saved.style && saved.style in CITATION_STYLE_LABELS) setCitationStyle(saved.style)
    } catch {
      /* unreadable or blocked storage: start with no saved references */
    }
  }, [referencesKey])

  // Save style and references with the document shortly after they change.
  useEffect(() => {
    if (!id) return
    const data: CitationData = { style: citationStyle, references }
    const json = JSON.stringify(data)
    try {
      if (referencesKey) localStorage.setItem(referencesKey, json)
    } catch {
      /* storage full or blocked: the server copy is the one that matters */
    }
    if (readOnly || savedCitationsRef.current === null || savedCitationsRef.current === json) return
    const timer = window.setTimeout(() => {
      api.documents
        .update(id, { citation_data: data }, shareToken)
        .then(() => {
          savedCitationsRef.current = json
        })
        .catch((error) => console.error('Saving references failed', error))
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [id, referencesKey, citationStyle, references, readOnly, shareToken])

  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(false)
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null)
 
  const prefs = useEditorPreferences()
  /** Master switch for in-canvas formatting suggestions: outlines, chips and the panel list. */
  const showFormatOverlays = prefs.formattingSuggestions
  const formattingSuggestionsRef = useRef<boolean>(prefs.formattingSuggestions)
  formattingSuggestionsRef.current = prefs.formattingSuggestions
  // One preference drives every preset overlay: the guide boxes and the style borders.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setBlueprintGuidesEnabled(prefs.showStyleGuides)
  }, [editor, prefs.showStyleGuides])
 
  /** Memoized header/footer config to prevent re-render loops in PagedEditor */
  const headerFooterConfig = useMemo<HeaderFooterConfig>(() => ({
    header: {
      default: { id: 'header-default', label: 'Header', content: headerContent, numberFormat: headerNumberFormat, startAt: 1, enabled: showHeader },
      firstPage: { id: 'header-first', label: 'First Page Header', content: '', numberFormat: 'none', startAt: 1, enabled: false },
      evenPages: { id: 'header-even', label: 'Even Page Header', content: '', numberFormat: 'none', startAt: 1, enabled: false },
      oddPages: { id: 'header-odd', label: 'Odd Page Header', content: '', numberFormat: 'none', startAt: 1, enabled: false },
      placement: headerPlacement,
    },
    footer: {
      default: { id: 'footer-default', label: 'Footer', content: footerContent, numberFormat: footerNumberFormat, startAt: 1, enabled: showFooter },
      firstPage: { id: 'footer-first', label: 'First Page Footer', content: '', numberFormat: 'none', startAt: 1, enabled: false },
      evenPages: { id: 'footer-even', label: 'Even Page Footer', content: '', numberFormat: 'none', startAt: 1, enabled: false },
      oddPages: { id: 'footer-odd', label: 'Odd Page Footer', content: '', numberFormat: 'none', startAt: 1, enabled: false },
      placement: footerPlacement,
    },
    differentFirstPage,
    differentOddEven: false,
    headerMargin: headerMarginIn,
    footerMargin: footerMarginIn,
    sections: [
      { name: 'Prelims', startPage: 0, numberFormat: 'roman', startAt: 1 },
      { name: 'Main', startPage: 1, numberFormat: 'number', startAt: 1 },
    ],
  }), [headerContent, footerContent, headerNumberFormat, footerNumberFormat, showHeader, showFooter, headerPlacement, footerPlacement, differentFirstPage, headerMarginIn, footerMarginIn])

  const chatContent = buildAiDocumentContext(content)

  // ── Progressive hydration state (large documents) ────────────────────
  /** True while PagedEditor is still streaming page chunks into the doc. */
  const [isHydrating, setIsHydrating] = useState(false)

  // ── Canvas header/footer direct manipulation (Bug 3) ─────────────────
  /** Set when a canvas double-click asks Page Setup to focus a field. */
  const [pageSetupFocusRequest, setPageSetupFocusRequest] = useState<'header' | 'footer' | null>(null)

  // ── Agentic auto-format scanner ──────────────────────────────────────
  const {
    suggestions: scannerSuggestions,
    activeSuggestion: scannerActive,
    acceptSuggestion: acceptScannerSuggestion,
    rejectSuggestion: rejectScannerSuggestion,
    selectSuggestion: selectScannerSuggestion,
  } = useAutoFormatScanner({
    editor,
    enabled: !!editor && !readOnly && !isHydrating && prefs.formattingSuggestions,
    minConfidence: confidenceThreshold(prefs),
    presetKey: formattingPreset,
    documentId: id,
  })

  // Grammar + spelling auto-check runs whatever side-panel tab is open, so the
  // wavy underlines in the document never depend on the panel being visible.
  const grammarCheck = useGrammarCheck({
    text: content,
    editor,
    enabled: !!editor && !readOnly && prefs.grammarSuggestions,
    onIssues: setGrammarIssues,
  })
  // Turning grammar checking off clears its underlines and list at once.
  useEffect(() => {
    if (!prefs.grammarSuggestions) setGrammarIssues([])
  }, [prefs.grammarSuggestions])

  /** Ctrl+\ keyboard shortcut toggles the docked side panel. */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const mod = event.ctrlKey || event.metaKey
      // Ctrl+Shift+\ toggles the left outline panel
      if (mod && event.shiftKey && event.key === '\\') {
        event.preventDefault()
        setLeftPanelOpen((open) => !open)
        return
      }
      // Ctrl+\ toggles the right docked side panel
      if (mod && !event.shiftKey && event.key === '\\') {
        event.preventDefault()
        setRightPanelOpen((open) => !open)
        return
      }
      // Word-style canvas zoom shortcuts (Ctrl+= / Ctrl+- / Ctrl+0).
      // These drive the in-editor zoom only — never the browser zoom.
      if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault()
        applyZoom(zoomLevelRef.current + ZOOM_STEP)
        return
      }
      if (mod && event.key === '-') {
        event.preventDefault()
        applyZoom(zoomLevelRef.current - ZOOM_STEP)
        return
      }
      if (mod && event.key === '0') {
        event.preventDefault()
        applyZoom(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  /** Ctrl+MouseWheel zooms only the document canvas, like Word. */
  useEffect(() => {
    const container = editorCanvasRef.current
    if (!container) return
    function onWheel(event: WheelEvent): void {
      if (!event.ctrlKey) return
      event.preventDefault()
      const delta = event.deltaY > 0 ? -0.05 : 0.05
      applyZoom(zoomLevelRef.current + delta)
    }
    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
    // applyZoom reads live values through refs, so an empty dep list is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Change the canvas zoom while keeping the visible content centered.
   * Scaling the viewport-center point by the zoom ratio stops the reader from
   * being thrown to an unrelated part of the document.
   */
  function applyZoom(nextZoom: number): void {
    const clamped = clampZoom(nextZoom)
    const container = editorCanvasRef.current
    const current = zoomLevelRef.current
    if (!container || current <= 0 || clamped === current) {
      setZoomLevel(clamped)
      return
    }
    const contentCenterY = container.scrollTop + container.clientHeight / 2
    const ratio = clamped / current
    const newScrollTop = Math.max(0, contentCenterY * ratio - container.clientHeight / 2)
    setZoomLevel(clamped)
    requestAnimationFrame(() => {
      const el = editorCanvasRef.current
      if (el) el.scrollTop = newScrollTop
    })
  }

  /** Fit Width: zoom so the page spans roughly 90% of the visible canvas. */
  function handleFitWidth(): void {
    const container = editorCanvasRef.current
    if (!container) return
    const preset = PAGE_SIZES[pageSize]
    const pageWidthPx = orientation === 'landscape' ? preset.height : preset.width
    // The canvas container has 1rem of horizontal padding on each side.
    const available = container.clientWidth - 32
    applyZoom((available * 0.9) / pageWidthPx)
  }

  // On a narrow screen, fit the page to the screen width once the canvas is up.
  useEffect(() => {
    if (!isNarrow || !editor) return
    const timer = window.setTimeout(handleFitWidth, 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNarrow, editor, pageSize, orientation])

  // Initialize offline sync for this document
  useOfflineSync(id)

  /** Keep the editor locked when this page is opened in read-only mode. */
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.setEditable(!readOnly)
  }, [editor, readOnly])

  /** Restore a trashed document straight from the read-only page, then go home. */
  async function handleRestoreFromReadonly(): Promise<void> {
    if (!id) return
    if (!window.confirm('Restore this document? It will be moved back to your active documents.')) return
    try {
      await api.documents.restore(id)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      console.error('Restore failed', err)
    }
  }

  /** Scroll the zoomed canvas so an editor position sits near the top (works at any zoom). */
  const scrollToDocPos = useCallback((pos: number, behavior: ScrollBehavior = 'smooth'): void => {
    if (!editor || editor.isDestroyed) return
    const container = editorCanvasRef.current
    if (!container) return
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      const coords = editor.view.coordsAtPos(pos)
      const containerRect = container.getBoundingClientRect()
      const target = container.scrollTop + (coords.top - containerRect.top) / zoomLevelRef.current - 96
      container.scrollTo({ top: Math.max(0, target), behavior })
    })
  }, [editor])

  /** Select a scanner suggestion's block, outline it, and scroll it into view. */
  const jumpToScannerTarget = useCallback((suggestion: ScannerSuggestion): void => {
    if (!editor || editor.isDestroyed) return
    const pos = Math.min(suggestion.from + 1, editor.state.doc.content.size)
    editor.chain().focus().setTextSelection(pos).run()
    setSuggestionRange({ from: suggestion.from, to: suggestion.to })
    scrollToDocPos(pos)
  }, [editor, scrollToDocPos])

  /** Smooth-scroll the canvas so the given editor position sits near the top. */
  function scrollCanvasToPos(pos: number): void {
    if (!editor || editor.isDestroyed) return
    const container = editorCanvasRef.current
    if (!container) return
    requestAnimationFrame(() => {
      if (!editor || editor.isDestroyed) return
      const coords = editor.view.coordsAtPos(pos)
      const containerRect = container.getBoundingClientRect()
      const targetScrollTop =
        container.scrollTop + (coords.top - containerRect.top) / zoomLevel - 80
      container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
    })
  }

  /**
   * Outline entry click: one-tap jump to the heading plus a spotlight flash.
   * The flash is a React-rendered overlay keyed to the heading's rect captured
   * *before* the selection transaction — ProseMirror re-renders the heading
   * DOM on that transaction, which used to wipe a DOM-attached CSS class and
   * caused the old two-click behaviour.
   */
  function handleOutlineHeadingClick(entry: TOCEntry, occurrence = 0): void {
    if (!editor || editor.isDestroyed) return
    const pos = findHeadingPosition(editor, entry.text, entry.level, occurrence)
    if (pos == null) return

    const container = editorCanvasRef.current
    const node = editor.view.nodeDOM(pos)
    const target = node instanceof HTMLElement ? node : node?.parentElement ?? null
    if (target && container) {
      const rect = target.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      setFlashCoords({
        top: (rect.top - containerRect.top) / zoomLevel + container.scrollTop,
        left: (rect.left - containerRect.left) / zoomLevel,
        width: rect.width / zoomLevel,
        height: rect.height / zoomLevel,
      })
      setFlashKey(Date.now())
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = window.setTimeout(() => setFlashCoords(null), 1700)
    }

    editor.chain().focus().setTextSelection(pos + 1).run()
    scrollCanvasToPos(pos + 1)
  }

  // Drop any pending flash timer when the page unmounts.
  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current)
    }
  }, [])

  // Sync the scanner's active suggestion into the document overlay highlight.
  // The overlay is always drawn for the active suggestion; the action popup
  // only opens when the user clicks the highlighted text.
  // A chip (group / inconsistency prompt) owns the range while it is open —
  // a scanner rescan must not steal the range out from under its Accept All.
  useEffect(() => {
    if (formatPrompt) return
    if (!scannerActive) {
      setSuggestionRange(null)
      return
    }
    setSuggestionRange({ from: scannerActive.from, to: scannerActive.to })
  }, [scannerActive, formatPrompt])

  useEffect(() => {
    if (!id) return
    const docId = id
    // Opening (or switching to) a document: nothing may be saved until the
    // server copy below has been applied, and a response for a document we
    // already navigated away from must never be applied to the new one.
    documentLoadedRef.current = false
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    let cancelled = false
    async function loadDocument(): Promise<void> {
      try {
        // Wake the grammar service while the document loads so the first check isn't a cold start.
        void api.warmServices()
        // Paint from the IndexedDB cache first so the editor is instant on reload.
        const cached = await getCachedDocumentRead(docId)
        if (cancelled) return
        if (cached && latestContentRef.current === '') {
          applyLoadedDocument(cached)
        }

        const doc = await api.documents.get(docId, shareToken)
        if (cancelled) return
        applyLoadedDocument(doc)
        documentLoadedRef.current = true
        // Opening a document puts it first in "Recent" and restarts its 7 days.
        void api.documents.markOpened(docId)
        // Edits that never reached the server are offered back, never applied silently.
        const draft = readLocalDraft(docId)
        if (draft && draft.content !== (doc.content ?? '') && new Date(draft.savedAt).getTime() > new Date(doc.updated_at).getTime()) {
          setRecoveredDraft(draft)
        } else if (draft) {
          clearLocalDraft(docId)
        }
        // Share-link visitors who are not the owner get a read-only session —
        // unless the link grants edit permission and is not expired.
        const linkExpired = Boolean(
          doc.share_expires_at && new Date(doc.share_expires_at).getTime() <= Date.now(),
        )
        if (shareToken && doc.user_id !== user?.id && (doc.share_permission !== 'edit' || linkExpired)) {
          setViewOnly(true)
        }
        void cacheDocumentRead(doc)
      } catch (error) {
        console.error(error)
        // The document never loaded, so saving is disabled; say so instead of
        // letting edits to an empty editor look saved.
        if (!cancelled) setSaveStatus('error')
      }
    }
    loadDocument()
    return () => {
      cancelled = true
    }
  }, [id])

  /* ── Supabase Realtime: live doc sync + collaborator presence ───────── */
  useEffect(() => {
    if (!id || !user?.id) return
    const docId = id
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Anonymous').trim()
    const color = avatarColor(user.id)

    const channel = supabase.channel(`document:${docId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: user.id },
      },
    })
    docChannelRef.current = channel

    // Live content sync — apply whole-document snapshots from peers without
    // triggering a local autosave or echoing the broadcast back.
    channel.on('broadcast', { event: 'doc_sync' }, ({ payload }: { payload: DocSyncPayload }) => {
      if (!payload || typeof payload.content !== 'string') return
      if (readOnly) return
      if (latestContentRef.current === payload.content) return
      latestContentRef.current = payload.content
      setContent(payload.content)
      if (typeof payload.title === 'string' && payload.title) {
        latestTitleRef.current = payload.title
        setTitle(payload.title)
      }
      if (typeof payload.header_content === 'string' && payload.footer_content !== undefined) {
        if (typeof payload.footer_content === 'string') {
          latestHeaderRef.current = payload.header_content
          latestFooterRef.current = payload.footer_content
          setHeaderContent(payload.header_content)
          setFooterContent(payload.footer_content)
        }
      }
    })

    const refreshPresence = (): void => {
      const seen: RemotePresence[] = []
      for (const list of Object.values(channel.presenceState())) {
        const first = list[0] as unknown as RemotePresence | undefined
        if (first?.user_id) seen.push(first)
      }
      setRemotePresence(new Map(seen.map((entry) => [entry.user_id, entry])))
    }

    channel
      .on('presence', { event: 'sync' }, refreshPresence)
      .on('presence', { event: 'join' }, refreshPresence)
      .on('presence', { event: 'leave' }, refreshPresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            display_name: displayName,
            color,
            updated_at: Date.now(),
          })
        }
      })

    return () => {
      docChannelRef.current = null
      supabase.removeChannel(channel)
      setRemotePresence(new Map())
    }
  }, [id, user?.id, readOnly, user?.displayName, user?.email])

  /** Apply a loaded document record to all editor state. */
  function applyLoadedDocument(doc: DocumentRecord): void {
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
    setSaveStatus('saved')
    resetCompositionBaseline(updateWordCount(nextContent))
    setIsIsolated(doc.is_isolated ?? false)
    setFormattingPreset(doc.formatting_preset ?? null)
    setDocOwnerId(doc.user_id ?? null)
    setPageLayout(doc.page_layout ?? null)
    setMissingDocFonts(fontNoticeDismissed(doc.id) ? [] : missingFonts(fontFamiliesIn(nextContent)))
    if (doc.citation_data) {
      setCitationStyle(doc.citation_data.style)
      setReferences(doc.citation_data.references)
      savedCitationsRef.current = JSON.stringify(doc.citation_data)
    } else {
      // No server copy yet: the first edit (or a browser-held copy) will be saved as one.
      savedCitationsRef.current = JSON.stringify({ style: 'ieee', references: [] })
    }
  }

  useEffect(() => {
    latestTitleRef.current = title
  }, [title])

  useEffect(() => {
    latestContentRef.current = content
  }, [content])

  useEffect(() => {
    latestFormatHistoryRef.current = formatHistory
  }, [formatHistory])

  /** Update the word count and return the plain-text length in characters. */
  function updateWordCount(html: string): number {
    const text = getPlainText(html)
    setWordCount(text ? text.split(' ').filter((w) => w.length > 0).length : 0)
    return text.length
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
    // Every section the document has (real headings plus bold structural lines
    // such as APPROVAL SHEET or DEDICATION), so the assistant knows what exists
    // even when the text excerpt below is cut short.
    const outline = extractTOCFromHTML(html).map((entry) => entry.text)

    const excerpt = plainText.slice(0, 2500)
    const outlineBlock =
      outline.length > 0
        ? `\n\nDocument outline:\n- ${outline.slice(0, 60).join('\n- ')}`
        : ''
    const truncatedNote =
      plainText.length > 2500
        ? '\n\n[Content truncated. Ask the user to run: /mcp getDocumentContent documentId=YOUR_ID page=1]'
        : ''
    return `${excerpt}${outlineBlock}\n\nWord count: ${words.length}${truncatedNote}`
  }

  function formatSuggestionLabel(format: string): string {
    const labels: Record<string, string> = {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      heading1: 'Chapter heading',
      heading2: 'Section heading',
      heading3: 'Subsection heading',
      h1: 'Chapter heading',
      h2: 'Section heading',
      h3: 'Subsection heading',
      blockquote: 'Blockquote',
      unordered_list: 'Bullet List',
      ordered_list: 'Numbered List',
      orderedList: 'Numbered List',
      bulletList: 'Bullet List',
      title: 'Title',
      paragraph: 'Paragraph',
    }

    return labels[format] ?? format
  }

  function isFormatAlreadyActive(format: string): boolean {
    if (!editor) return false
    switch (format) {
      case 'bold': return editor.isActive('bold')
      case 'italic': return editor.isActive('italic')
      case 'underline': return editor.isActive('underline')
      case 'strikethrough': return editor.isActive('strike')
      case 'heading1': case 'h1': return editor.isActive('heading', { level: 1 })
      case 'heading2': case 'h2': return editor.isActive('heading', { level: 2 })
      case 'heading3': case 'h3': return editor.isActive('heading', { level: 3 })
      case 'title': return editor.isActive('heading', { level: 1 }) && editor.getAttributes('heading').docRole === 'title'
      case 'unordered_list': case 'ul': return editor.isActive('bulletList')
      case 'ordered_list': case 'ol': return editor.isActive('orderedList')
      case 'blockquote': return editor.isActive('blockquote')
      default: return false
    }
  }

  /** Read `{"fontSize":"14pt"}` style attributes as a whole number in points. */
  function extractFontSizePt(raw: unknown): number | null {
    if (typeof raw !== 'string') return null
    const ptMatch = raw.match(/([\d.]+)pt/)
    if (ptMatch) return Math.round(parseFloat(ptMatch[1]))
    const pxMatch = raw.match(/([\d.]+)px/)
    if (pxMatch) return Math.round((parseFloat(pxMatch[1]) * 72) / 96)
    return null
  }

  /** Resolve alignment from either the extension's textAlign attr or the inline
   *  style attr that CustomParagraph preserves through save/load. */
  function resolveTextAlign(editorValue: Editor): string | undefined {
    const candidates: unknown[] = [
      editorValue.getAttributes('paragraph').textAlign,
      editorValue.getAttributes('heading').textAlign,
      editorValue.getAttributes('paragraph').style,
      editorValue.getAttributes('heading').style,
    ]
    for (const raw of candidates) {
      if (typeof raw !== 'string' || raw.length === 0) continue
      const direct = raw.trim()
      if (['left', 'center', 'right', 'justify'].includes(direct)) return direct
      const styleMatch = raw.match(/text-align:\s*([a-z]+)/i)
      if (styleMatch) return styleMatch[1].toLowerCase()
    }
    return undefined
  }

  /** Snapshot the text + mark state at the format-apply site for behavior learning. */
  function captureFormatPayload(formatType: string): BehaviorEventPayload | undefined {
    if (!editor || editor.isDestroyed) return undefined
    const { from, to } = editor.state.selection
    let text: string
    if (from !== to) {
      text = editor.state.doc.textBetween(from, to).trim()
    } else {
      const $pos = editor.state.doc.resolve(from)
      text = $pos.parent.textContent.trim()
    }
    if (text.length < 3) return undefined
    return {
      text,
      format: formatType,
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      fontSize: extractFontSizePt(editor.getAttributes('textStyle').fontSize),
      textAlign: resolveTextAlign(editor),
    }
  }

  /** Behavior payload for a format that came from accepting a suggestion (not learned from). */
  function suggestionPayload(formatType: string): BehaviorEventPayload | undefined {
    const captured = captureFormatPayload(formatType)
    return captured ? { ...captured, fromSuggestion: true } : undefined
  }

  /** Human label for a learned format (e.g. "Bold + 14pt + Center"). */
  function buildLearnedLabel(result: TierCheckResponse): string {
    const parts: string[] = []
    if (result.bold) parts.push('Bold')
    if (result.italic) parts.push('Italic')
    if (result.underline) parts.push('Underline')
    if (typeof result.fontSize === 'number' && result.fontSize > 0) {
      parts.push(`${result.fontSize}pt`)
    }
    if (result.textAlign && result.textAlign !== 'left') {
      parts.push(result.textAlign.charAt(0).toUpperCase() + result.textAlign.slice(1))
    }
    if (parts.length === 0) {
      return formatSuggestionLabel(result.format ?? 'paragraph')
    }
    return parts.join(' + ')
  }

  /** Build a suggestion card for a learned cross-document format match. */
  function buildLearnedSuggestion(result: TierCheckResponse): Suggestion {
    const label = buildLearnedLabel(result)
    const confidencePercent = confidenceToPercent(result.confidence ?? 0)
    return {
      format: result.format ?? 'paragraph',
      confidence: confidencePercent,
      reason: `You formatted matching text as ${label} in another document`,
      label,
      bold: result.bold,
      italic: result.italic,
      underline: result.underline,
      fontSize: result.fontSize ?? undefined,
      textAlign: result.textAlign,
      suggestionSource: 'learned',
    }
  }

  /** Reproduce a learned suggestion's full format (marks + size + alignment) on the selection or an explicit range. */
  function applyLearnedFormat(
    s: Pick<Suggestion, 'format' | 'bold' | 'italic' | 'underline' | 'fontSize' | 'textAlign'>,
    range?: { from: number; to: number }
  ): { from: number; to: number } | null {
    if (!editor || editor.isDestroyed || !editor.isEditable) return null

    // A caret (no selection) expands to the whole block so marks, size, and
    // alignment apply without requiring the user to highlight text first —
    // matching the chatbot's block-level apply behavior. An explicit range
    // (group apply) is used verbatim.
    const { from: selFrom, to: selTo } = editor.state.selection
    let from = range?.from ?? selFrom
    let to = range?.to ?? selTo
    if (!range && from === to) {
      const $pos = editor.state.doc.resolve(from)
      from = $pos.before()
      to = $pos.after()
    }

    // A selection that straddles block boundaries makes the second mark command
    // in a sequence (bold then size) silently drop, so marks go over the text
    // inside the blocks, just like a manual selection would.
    const doc = editor.state.doc
    const textFrom = doc.resolve(from).depth === 0 ? from + 1 : from
    const textTo = doc.resolve(to).depth === 0 ? to - 1 : to
    const textRange = { from: textFrom, to: Math.max(textFrom, textTo) }
    // One ProseMirror transaction adds every learned mark; font size merges into
    // any existing text style so the font family survives.
    const { schema } = editor.state
    const tr = editor.state.tr
    for (const [wanted, markName] of [[s.bold, 'bold'], [s.italic, 'italic'], [s.underline, 'underline']] as const) {
      if (wanted && schema.marks[markName]) tr.addMark(textRange.from, textRange.to, schema.marks[markName].create())
    }
    // An explicit false (body-text consistency) takes a stray bold or italic off.
    for (const [wanted, markName] of [[s.bold, 'bold'], [s.italic, 'italic']] as const) {
      if (wanted === false && schema.marks[markName]) tr.removeMark(textRange.from, textRange.to, schema.marks[markName])
    }
    if (typeof s.fontSize === 'number' && s.fontSize > 0 && schema.marks.textStyle) {
      const styleType = schema.marks.textStyle
      editor.state.doc.nodesBetween(textRange.from, textRange.to, (node, pos) => {
        if (!node.isText) return true
        const existing = node.marks.find((mark) => mark.type === styleType)
        tr.addMark(
          Math.max(pos, textRange.from),
          Math.min(pos + node.nodeSize, textRange.to),
          styleType.create({ ...(existing?.attrs ?? {}), fontSize: `${s.fontSize}pt` })
        )
        return false
      })
    }
    // fontSize null means the document's usual size is the inherited one: drop an explicit size.
    if (s.fontSize === null && schema.marks.textStyle) {
      const styleType = schema.marks.textStyle
      editor.state.doc.nodesBetween(textRange.from, textRange.to, (node, pos) => {
        if (!node.isText) return true
        const existing = node.marks.find((mark) => mark.type === styleType)
        if (existing?.attrs?.fontSize) {
          tr.addMark(Math.max(pos, textRange.from), Math.min(pos + node.nodeSize, textRange.to), styleType.create({ ...existing.attrs, fontSize: '' }))
        }
        return false
      })
    }
    if (tr.docChanged) editor.view.dispatch(tr)
    // Block type first, then alignment LAST — converting a paragraph to a
    // heading resets the paragraph's text-align attribute, so alignment
    // must be applied after the node type change to survive.
    const block = editor.chain().focus().setTextSelection({ from, to })
    if (s.format === 'blockquote') block.setBlockquote()
    else if (s.format === 'heading1' || s.format === 'h1') block.setHeading({ level: 1 })
    else if (s.format === 'heading2' || s.format === 'h2') block.setHeading({ level: 2 })
    else if (s.format === 'heading3' || s.format === 'h3') block.setHeading({ level: 3 })
    if (s.textAlign && ['left', 'center', 'right', 'justify'].includes(s.textAlign)) {
      block.setTextAlign(s.textAlign)
    }
    block.run()

    return { from, to }
  }

  function applyPromptFormat(format: string): void {
    if (!editor || !editor.isEditable) return
    if (isFormatAlreadyActive(format)) return

    switch (format) {
      case 'bold':          editor.chain().focus().setBold().run(); break
      case 'italic':        editor.chain().focus().setItalic().run(); break
      case 'underline':     editor.chain().focus().setUnderline().run(); break
      case 'strikethrough': editor.chain().focus().setStrike().run(); break
      case 'heading1': case 'h1': editor.chain().focus().setHeading({ level: 1 }).run(); break
      case 'heading2': case 'h2': editor.chain().focus().setHeading({ level: 2 }).run(); break
      case 'heading3': case 'h3': editor.chain().focus().setHeading({ level: 3 }).run(); break
      case 'title': applyStyleCommand(editor, 'title', undefined, undefined, formattingPreset); break
      case 'unordered_list': case 'ul': if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run(); break
      case 'ordered_list': case 'ol': case 'orderedList': if (!editor.isActive('orderedList')) editor.chain().focus().toggleOrderedList().run(); break
      case 'bulletList': if (!editor.isActive('bulletList')) editor.chain().focus().toggleBulletList().run(); break
      case 'blockquote':    editor.chain().focus().setBlockquote().run(); break
      default: break
    }
  }

  /**
   * Length of the markdown marker ("## ", "> ", "- ", "1. ") the author typed at
   * the start of the block that begins at `from`, when it belongs to `format`.
   */
  function markdownMarkerLength(format: string, from: number): number {
    if (!editor || editor.isDestroyed) return 0
    const $pos = editor.state.doc.resolve(Math.min(from + 1, editor.state.doc.content.size))
    const patterns: Record<string, RegExp> = {
      heading1: /^#\s+/, heading2: /^##\s+/, heading3: /^###\s+/,
      blockquote: /^>\s+/, bulletList: /^[-*]\s+/, orderedList: /^\d+[.)]\s+/,
    }
    const match = patterns[format]?.exec($pos.parent.textContent)
    return match ? match[0].length : 0
  }

  /** Apply one prompt format directly over an explicit document range. */
  function applyFormatToRange(format: string, from: number, to: number): void {
    if (!editor || !editor.isEditable) return
    if (format === 'title') {
      applyStyleCommand(editor, 'title', from, to, formattingPreset)
      return
    }
    // A markdown marker the author typed is replaced by the real format.
    const marker = markdownMarkerLength(format, from)
    if (marker > 0) {
      editor.chain().deleteRange({ from: from + 1, to: from + 1 + marker }).run()
      to -= marker
    }
    if (format === 'orderedList' || format === 'ordered_list' || format === 'ol') {
      editor.chain().focus().setTextSelection(from + 1).toggleOrderedList().run()
      return
    }
    if (format === 'bulletList' || format === 'unordered_list' || format === 'ul') {
      editor.chain().focus().setTextSelection(from + 1).toggleBulletList().run()
      return
    }
    const chain = editor.chain().focus().setTextSelection({ from, to })
    switch (format) {
      case 'bold':          chain.setBold().run(); break
      case 'italic':        chain.setItalic().run(); break
      case 'underline':     chain.setUnderline().run(); break
      case 'strikethrough': chain.setStrike().run(); break
      case 'heading1': case 'h1': chain.setHeading({ level: 1 }).run(); break
      case 'heading2': case 'h2': chain.setHeading({ level: 2 }).run(); break
      case 'heading3': case 'h3': chain.setHeading({ level: 3 }).run(); break
      case 'blockquote':    chain.setBlockquote().run(); break
      default: break
    }
  }

  /** Alternatives offered by the chip's "change to" cycling. */
  const SUGGESTION_ALTERNATIVES: Record<string, string[]> = {
    heading1: ['heading1', 'heading2', 'heading3', 'bold', 'paragraph'],
    heading2: ['heading2', 'heading1', 'heading3', 'paragraph'],
    heading3: ['heading3', 'heading2', 'heading1', 'paragraph'],
    bold: ['bold', 'italic', 'underline', 'paragraph'],
    italic: ['italic', 'bold', 'underline', 'paragraph'],
    underline: ['underline', 'bold', 'italic', 'paragraph'],
    blockquote: ['blockquote', 'paragraph'],
    unordered_list: ['unordered_list', 'ordered_list', 'paragraph'],
    ordered_list: ['ordered_list', 'unordered_list', 'paragraph'],
  }

  /** Cycle the chip's current format to the next/previous alternative. */
  function cycleSuggestionFormat(direction: 1 | -1): void {
    if (!formatPrompt) return
    // Learned formats reproduce a stored combination — don't let arrow-cycling
    // replace the primary format and drop the captured attributes.
    if (formatPrompt.suggestionSource === 'learned') return
    const list = SUGGESTION_ALTERNATIVES[formatPrompt.format] ?? [formatPrompt.format]
    const idx = list.indexOf(formatPrompt.format)
    if (idx < 0) return
    const next = list[(idx + direction + list.length) % list.length]
    setFormatPrompt({ format: next, confidence: formatPrompt.confidence })
  }

  const updateSuggestionAnchor = useCallback((): void => {
    if (!editor || editor.isDestroyed || !suggestionRange) return
    const { from, to } = suggestionRange
    const view = editor.view

    // The range may outlive the content it was computed on (content replaced,
    // undo shrank the doc, another doc loaded). ProseMirror throws a
    // RangeError for positions outside the document, so bail out before
    // querying coordinates for a stale range.
    const docSize = editor.state.doc.content.size
    if (from < 0 || to > docSize || to < from || from >= docSize) return

    // Chip anchor (viewport space) — top-left of the range. Even with the
    // bounds check above, a coordinate query can race the editor's own state
    // during a transaction, so treat any leftover range error as "no anchor".
    let start: { left: number; top: number } | null
    let endpoint: { left: number; top: number } | null
    try {
      start = view.coordsAtPos(from + 1)
      endpoint = view.coordsAtPos(to <= from + 1 ? from + 1 : to - 1)
    } catch {
      setSuggestionAnchor(null)
      return
    }
    if (!start || !endpoint) return
    if (start.left === 0 && start.top === 0) return
    setSuggestionAnchor({ x: Math.min(start.left, endpoint.left), y: start.top })
  }, [editor, suggestionRange])

  // Recompute the chip anchor when the range, editor, window, or editor
  // transactions change (covers typing, scrolling, page layout shifts, and
  // mark changes from the chip's "change to" cycling). The block outline
  // itself needs no measuring — the decoration wraps the target block.
  useEffect(() => {
    if (!suggestionRange || !editor || editor.isDestroyed) {
      setSuggestionAnchor(null)
      return
    }
    const refresh = (): void => updateSuggestionAnchor()
    refresh()
    document.addEventListener('scroll', refresh, { passive: true })
    window.addEventListener('resize', refresh)
    editor.on('transaction', refresh)
    return () => {
      document.removeEventListener('scroll', refresh)
      window.removeEventListener('resize', refresh)
      editor.off('transaction', refresh)
    }
  }, [suggestionRange, editor, updateSuggestionAnchor])

  // Drive the pulsing suggestion outline. It is emitted as a ProseMirror node
  // decoration so the wrapper sits in the document DOM around the target
  // block, which keeps it in sync with the content on every transaction and
  // out of the z-index competition with the floating suggestion chip.
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.commands.setSuggestionHighlight) return
    const active =
      showFormatOverlays && !readOnly && (scannerActive || pendingLearnedFormat)
        ? suggestionRange
        : null
    editor.commands.setSuggestionHighlight(active ? { ...active } : null)
  }, [editor, suggestionRange, scannerActive, pendingLearnedFormat, readOnly, showFormatOverlays])

  // While the suggestion popup is open, draw the suggested look on the page as a
  // preview (decorations only, so the document and its undo history stay untouched).
  const previewStyle = formatPrompt ? suggestionPreviewStyle(formatPrompt) : null
  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.commands.setSuggestionPreview) return
    const show = showFormatOverlays && !readOnly && formatPrompt && suggestionRange && previewStyle && previewMode === 'after'
    editor.commands.setSuggestionPreview(
      show && suggestionRange && previewStyle ? { ...suggestionRange, ...previewStyle } : null
    )
  }, [editor, formatPrompt, suggestionRange, previewMode, previewStyle?.inlineStyle, previewStyle?.blockStyle, showFormatOverlays, readOnly])

  // Each newly opened popup starts on "After".
  useEffect(() => {
    setPreviewMode('after')
  }, [formatPrompt?.format, formatPrompt?.label])

  // Turning the overlay master switch off clears any live suggestion state so
  // no chip, outline, or pending highlight lingers.
  useEffect(() => {
    if (showFormatOverlays) return
    setFormatPrompt(null)
    setSuggestionRange(null)
    setPendingLearnedFormat(null)
  }, [showFormatOverlays])

  // Keyboard: Ctrl/Cmd+Enter accepts, Esc rejects, Alt+ArrowUp/Down cycles "change to".
  useEffect(() => {
    function onSuggestionKey(event: KeyboardEvent): void {
      if (!formatPrompt || !suggestionRange) return
      const el = document.activeElement as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (event.key === 'Escape') {
        event.preventDefault()
        handlePromptReject()
        return
      }
      // Plain Enter must keep making new lines; accepting needs Ctrl/Cmd.
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        handlePromptAccept(formatPrompt)
        return
      }
      if (event.altKey && event.key === 'ArrowDown') {
        event.preventDefault()
        cycleSuggestionFormat(1)
        return
      }
      if (event.altKey && event.key === 'ArrowUp') {
        event.preventDefault()
        cycleSuggestionFormat(-1)
      }
    }
    window.addEventListener('keydown', onSuggestionKey)
    return () => window.removeEventListener('keydown', onSuggestionKey)
  }, [formatPrompt, suggestionRange])

  function scheduleAutoFormatPrediction(nextContent: string): void {
    // Content changes caused by a grammar/spelling replacement are skipped so
    // the corrected paragraph never triggers an automatic format apply.
    if (suppressAutoFormatRef.current) {
      suppressAutoFormatRef.current = false
      if (autoFormatTimer.current) {
        clearTimeout(autoFormatTimer.current)
        autoFormatTimer.current = null
      }
      return
    }

    if (autoFormatTimer.current) {
      clearTimeout(autoFormatTimer.current)
    }

    autoFormatTimer.current = setTimeout(() => {
      void runAutoFormatPrediction(nextContent)
    }, AUTO_FORMAT_DELAY)
  }

  async function runAutoFormatPrediction(nextContent: string): Promise<void> {
    if (!editor || !editor.isEditable) return
    const plainText = getPlainText(nextContent).slice(0, 50000)

    // Extract the active paragraph / line / selection text for context-aware prediction
    let activeText = ''
    if (editor && !editor.isDestroyed) {
      const { from, to } = editor.state.selection
      if (from !== to) {
        activeText = editor.state.doc.textBetween(from, to).trim()
      } else {
        const $pos = editor.state.doc.resolve(from)
        activeText = $pos.parent.textContent.trim()
      }
    }
    if (!activeText) {
      const lines = plainText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
      activeText = lines[lines.length - 1] ?? ''
    }

    if (activeText.length < 3) {
      // DO NOT clear whole-document scanner suggestions when the caret moves over regular text!
      // Scanner suggestions belong to the document, not just the active caret!
      setPendingLearnedFormat(null)
      return
    }

    try {
      const result = await api.formatting.tierCheck(activeText, id ?? '')

      if (result.format && isFormatAlreadyActive(result.format)) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // Never propose what the block already is (a numbered line inside a numbered
      // list, a heading that is already that heading) or a title far from the top.
      if (result.format && editor && !editor.isDestroyed) {
        const caret = editor.state.selection.from
        const satisfied = isFormatSatisfied(describeBlock(editor.state.doc, caret), result.format)
        const strayTitle = result.format === 'title' && !isTitleCandidate(editor.state.doc, caret)
        if (satisfied || strayTitle) {
          setSuggestions([])
          setShowSuggestions(false)
          setPendingLearnedFormat(null)
          return
        }
        // The document's own habits come first: what the user usually does elsewhere
        // never overrides a style this document has clearly settled on.
        if (result.tier === 'learned' || result.tier === 'ml') {
          const profile = buildStyleProfile(editor.state.doc)
          const proposed = {
            ...(result.bold !== undefined ? { bold: result.bold } : {}),
            ...(result.italic !== undefined ? { italic: result.italic } : {}),
            ...(typeof result.fontSize === 'number' ? { fontSize: result.fontSize } : {}),
            ...(result.textAlign ? { textAlign: result.textAlign } : {}),
          }
          if (documentStyleOverrides(profile, editor.state.doc, caret, proposed)) {
            setSuggestions([])
            setShowSuggestions(false)
            setPendingLearnedFormat(null)
            return
          }
        }
      }

      // With formatting suggestions turned off, learned and ML tiers stay silent.
      if (!formattingSuggestionsRef.current && (result.tier === 'learned' || result.tier === 'ml')) {
        setSuggestions([])
        setShowSuggestions(false)
        setPendingLearnedFormat(null)
        return
      }

      // A suggestion the user already rejected for this exact text stays quiet.
      if (result.format && (result.tier === 'learned' || result.tier === 'ml')) {
        const quietUntil = suppressedAutoFormatsRef.current[suppressionKey(result.format, activeText)]
        if (quietUntil && quietUntil > Date.now()) {
          setSuggestions([])
          setShowSuggestions(false)
          setPendingLearnedFormat(null)
          return
        }
      }

      // Tier 1/2 — preset rule or custom binding: apply immediately.
      if (result.tier === 'binding' || result.tier === 'preset') {
        if (result.format) {
          applyPromptFormat(result.format)
          handleFormat(result.format, suggestionPayload(result.format))
        }
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // Learned tier — a text→format match from the user's own behavior in
      // another document. Surfaces as an inline chip + highlight (never auto-applies).
      if (result.tier === 'learned') {
        if (!result.format || result.confidence === undefined) {
          setSuggestions([])
          setShowSuggestions(false)
          return
        }

        const headingFamily = ['heading1', 'heading2', 'heading3', 'h1', 'h2', 'h3', 'blockquote'].includes(result.format)
        const inList = editor?.isActive('bulletList') || editor?.isActive('orderedList') || editor?.isActive('listItem')
        if (headingFamily && inList) {
          setSuggestions([])
          setShowSuggestions(false)
          return
        }
        if (result.confidence < AUTO_FORMAT_CONFIDENCE_THRESHOLD) {
          setSuggestions([])
          setShowSuggestions(false)
          return
        }

        if (result.format !== 'paragraph' && result.format !== 'body_text') {
          // Highlight the matched block and pop the inline chip at the caret.
          const { from: selFrom, to: selTo } = editor.state.selection
          let rangeFrom: number
          let rangeTo: number
          if (selFrom !== selTo) {
            rangeFrom = selFrom
            rangeTo = selTo
          } else {
            const $pos = editor.state.doc.resolve(selFrom)
            rangeFrom = $pos.before()
            rangeTo = $pos.after()
          }
          setSuggestionRange({ from: rangeFrom, to: rangeTo })
          // Highlight the matched block first; the chip pops only on click.
          setPendingLearnedFormat({
            format: result.format,
            confidence: confidenceToPercent(result.confidence),
            label: buildLearnedLabel(result),
            bold: result.bold,
            italic: result.italic,
            underline: result.underline,
            fontSize: result.fontSize ?? undefined,
            textAlign: result.textAlign,
            suggestionSource: 'learned',
          })
          setSuggestions([buildLearnedSuggestion(result)])
          setShowSuggestions(true)
          return
        }
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // Tier 3 — ML prediction with confidence score.
      if (result.tier !== 'ml' || !result.format || result.confidence === undefined) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      const predictedFormat = result.format
      const confidence = result.confidence

      // Regular body text / paragraphs don't need a formatting suggestion prompt
      if (predictedFormat === 'paragraph' || predictedFormat === 'body_text') {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // Suppress heading suggestions on questionnaire / option lines and lists
      const isQuestionLine = /[?？]\s*$/.test(activeText) || /^[a-dA-D][.)]\s/.test(activeText)
      const isHeadingFamily = ['heading1', 'heading2', 'heading3', 'h1', 'h2', 'h3'].includes(predictedFormat)
      const inList = editor?.isActive('bulletList') || editor?.isActive('orderedList') || editor?.isActive('listItem')
      if (isHeadingFamily && (isQuestionLine || inList)) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // A paragraph that already shows its own number, letter or bullet is a list the
      // author wrote by hand: offering to turn it into a list is wrong.
      const isListFormat = ['ordered_list', 'orderedList', 'ol', 'unordered_list', 'bulletList', 'ul'].includes(predictedFormat)
      const typedMarker = /^\s*(\d+[.)]|[a-z][.)]|[ivx]+[.)]|[-*•])\s*\S/i.test(activeText)
      if (isListFormat && (inList || typedMarker)) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      if (confidence < AUTO_FORMAT_CONFIDENCE_THRESHOLD) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      // Scan candidate lines across the document to populate the Suggestions drawer.
      // The inline highlight + accept/reject chip are driven by the auto-format
      // scanner (useAutoFormatScanner), which sweeps the whole document on an
      // interval, so the prediction below only feeds the side drawer — the two
      // engines can no longer overwrite each other's UI state.
      const lines = plainText.split('\n').map((l) => l.trim()).filter((l) => l.length >= 4 && l.length <= 120)
      const candidateLines = lines.slice(0, 8)

      const newSuggestions: Suggestion[] = []
      if (predictedFormat !== 'paragraph' && predictedFormat !== 'body_text') {
        const confidencePercent = confidenceToPercent(confidence)
        newSuggestions.push({
          format: predictedFormat,
          confidence: confidencePercent,
          reason: `Predicted ${formatSuggestionLabel(predictedFormat)} for current section based on academic layout patterns.`,
        })
      }

      // Check additional lines if present for the suggestions drawer
      for (const line of candidateLines) {
        if (line === plainText.trim()) continue
        if (/^(chapter|\d+\.|\d+\.\d+|[ivx]+\.)/i.test(line)) {
          const isH2 = /^\d+\.\d+\s+/i.test(line)
          const isH3 = /^\d+\.\d+\.\d+\s+/i.test(line)
          const fmt = isH3 ? 'heading3' : isH2 ? 'heading2' : 'heading1'
          if (!newSuggestions.some((s) => s.format === fmt)) {
            newSuggestions.push({
              format: fmt,
              confidence: 95,
              reason: `Detected "${line.slice(0, 30)}..." as an academic ${formatSuggestionLabel(fmt)}.`,
            })
          }
        }
      }

      if (newSuggestions.length > 0) {
        setSuggestions(newSuggestions)
        setShowSuggestions(true)
      } else {
        setSuggestions([])
        setShowSuggestions(false)
      }
    } catch (error) {
      console.error('Auto-format prediction failed', error)
    }
  }



  function scheduleSave(): void {
    if (readOnly || !documentLoadedRef.current) return
    pendingSaveRef.current = true
    saveRetryCountRef.current = 0
    setSaveStatus('unsaved')
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      void saveDocument()
    }, AUTOSAVE_DELAY)
  }

  async function saveDocument(): Promise<void> {
    // Never write before the server copy was applied (see documentLoadedRef).
    if (!id || !documentLoadedRef.current) return

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
      }, shareToken)
      latestContentRef.current = nextContent
      setContent(nextContent)
      saveRetryCountRef.current = 0
      setSaveStatus('saved')
      setStorageFull(false)
      clearLocalDraft(id)
      if (id) void evictCachedDocument(id)

      // Broadcast the finished stroke to collaborators on the live channel.
      const channel = docChannelRef.current
      if (channel) {
        void channel
          .send({
            type: 'broadcast',
            event: 'doc_sync',
            payload: {
              content: nextContent,
              title: nextTitle,
              header_content: latestHeaderRef.current,
              footer_content: latestFooterRef.current,
              sender_id: user?.id ?? '',
              timestamp: Date.now(),
            },
          })
          .catch(() => {})
      }
    } catch (error) {
      console.error('Autosave failed', error)
      // Keep the unsaved edits in this browser so a closed tab or a long outage loses nothing.
      writeLocalDraft(id, { title: nextTitle, content: nextContent })
      if ((error as { status?: number }).status === 413) {
        // Out of storage: retrying can't help. The draft above keeps the edits until space is freed.
        pendingSaveRef.current = false
        saveRetryCountRef.current = 0
        setStorageFull(true)
        setSaveStatus('error')
        return
      }
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

  // Closing the tab with a save still pending keeps those edits for the next visit.
  useEffect(() => {
    if (!id) return
    const keepPendingEdits = (): void => {
      if (documentLoadedRef.current && (pendingSaveRef.current || savingRef.current)) {
        writeLocalDraft(id, { title: latestTitleRef.current, content: latestContentRef.current })
      }
    }
    window.addEventListener('beforeunload', keepPendingEdits)
    return () => window.removeEventListener('beforeunload', keepPendingEdits)
  }, [id])

  /** Put recovered unsaved edits back into the document and save them. */
  function restoreRecoveredDraft(): void {
    if (!recoveredDraft || !id) return
    latestTitleRef.current = recoveredDraft.title || latestTitleRef.current
    if (recoveredDraft.title) setTitle(recoveredDraft.title)
    setContent(recoveredDraft.content)
    handleContentChange(recoveredDraft.content)
    setRecoveredDraft(null)
  }

  /** Forget recovered unsaved edits and keep the saved copy. */
  function discardRecoveredDraft(): void {
    if (id) clearLocalDraft(id)
    setRecoveredDraft(null)
  }

  function handleContentChange(newContent: string): void {
    // The empty editor emits an update on mount; before the document has
    // loaded that is not an edit and must not touch the latest-content cache.
    if (!documentLoadedRef.current) return
    // Skip echoes: layout transactions can re-emit identical HTML, and
    // re-setting the same content would re-render this page (and with it
    // PagedEditor) on every transaction, restarting the update cycle.
    if (newContent === latestContentRef.current) return
    latestContentRef.current = newContent
    setContent(newContent)
    const textLength = updateWordCount(newContent)
    trackComposition(textLength)
    scheduleSave()
    scheduleAutoFormatPrediction(newContent)
  }

  /** Compose one behavior event for the timeline forensics engine. */
  function logCompositionEvent(action: 'type' | 'paste' | 'backspace', charCount: number): void {
    if (!id || charCount <= 0) return
    // The live cursor sits at the end of the edit, so its ProseMirror position
    // (and the document size) attribute this event to the right region.
    const selectionPos = editor && !editor.isDestroyed ? editor.state.selection.from : 0
    const docSize = editor && !editor.isDestroyed ? editor.state.doc.content.size : 0
    api.behavior
      .log({
        action,
        timestamp: new Date().toISOString(),
        documentId: id,
        char_count: charCount,
        position: selectionPos,
        doc_size: docSize,
      })
      .catch((error) => console.error('Composition telemetry log failed', error))
  }

  /** Log accumulated typing as one event (character volumes only, never text). */
  function flushTypedChars(): void {
    const state = compositionRef.current
    if (state.pendingTypedChars <= 0) return
    logCompositionEvent('type', state.pendingTypedChars)
    state.pendingTypedChars = 0
  }

  /**
   * Lightweight composition telemetry for timeline forensics: bulk insertions
   * become 'paste' events, accumulated typing becomes 'type' events, and bulk
   * deletions become 'backspace' events. Only character volumes are stored.
   */
  function trackComposition(nextTextLength: number): void {
    const state = compositionRef.current
    const delta = nextTextLength - state.lastTextLength
    state.lastTextLength = nextTextLength

    // Ignore the initial load and progressive hydration window.
    if (Date.now() < state.suppressUntil) return

    if (delta >= COMPOSITION_PASTE_MIN_CHARS) {
      flushTypedChars()
      logCompositionEvent('paste', delta)
      return
    }

    if (delta >= 1) {
      state.pendingTypedChars += delta
      if (!compositionFlushTimer.current) {
        compositionFlushTimer.current = setTimeout(() => {
          compositionFlushTimer.current = null
          flushTypedChars()
        }, COMPOSITION_TYPING_FLUSH_MS)
      }
      return
    }

    if (delta <= -COMPOSITION_DELETE_MIN_CHARS) {
      logCompositionEvent('backspace', -delta)
    }
  }

  /** Reset the composition baseline after a document load. */
  function resetCompositionBaseline(textLength: number): void {
    compositionRef.current.lastTextLength = textLength
    compositionRef.current.pendingTypedChars = 0
    compositionRef.current.suppressUntil = Date.now() + COMPOSITION_LOAD_SUPPRESS_MS
  }

  function handleTitleChange(event: ChangeEvent<HTMLInputElement>): void {
    const nextTitle = event.target.value
    latestTitleRef.current = nextTitle
    setTitle(nextTitle)
    scheduleSave()
  }

  /**
   * Editing the header or footer replaces what the import brought (art, per-section
   * headers, restarting page numbers): the text the user types takes over.
   */
  function dropPageLayout(): void {
    if (!pageLayout) return
    setPageLayout(null)
    if (id && !readOnly) {
      api.documents
        .update(id, { page_layout: null }, shareToken)
        .catch((error) => console.error('Clearing the imported page layout failed', error))
    }
  }

  function handleHeaderChange(value: string): void {
    dropPageLayout()
    latestHeaderRef.current = value
    setHeaderContent(value)
    scheduleSave()
  }

  function handleFooterChange(value: string): void {
    dropPageLayout()
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

  /** Canvas double-click on a page header/footer: enable it, then focus Page Setup. */
  const handleHeaderFooterActivate = useCallback((target: 'header' | 'footer'): void => {
    if (target === 'header') handleShowHeaderChange(true)
    else handleShowFooterChange(true)
    setPageSetupFocusRequest(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Clears the Page Setup focus request once the toolbar has consumed it. */
  const handlePageSetupFocusHandled = useCallback((): void => {
    setPageSetupFocusRequest(null)
  }, [])

  function handleHeaderNumberFormatChange(value: PageNumberFormat): void {
    dropPageLayout()
    latestHeaderSettingsRef.current.headerNumberFormat = value
    setHeaderNumberFormat(value)
    scheduleSave()
  }

  function handleFooterNumberFormatChange(value: PageNumberFormat): void {
    dropPageLayout()
    latestHeaderSettingsRef.current.footerNumberFormat = value
    setFooterNumberFormat(value)
    scheduleSave()
  }

  function handleHeaderPlacementChange(value: HeaderFooterPlacement): void {
    setHeaderPlacement(value)
    scheduleSave()
  }

  function handleFooterPlacementChange(value: HeaderFooterPlacement): void {
    setFooterPlacement(value)
    scheduleSave()
  }

  function handleHeaderMarginChange(value: number): void {
    setHeaderMarginIn(value)
    scheduleSave()
  }

  function handleFooterMarginChange(value: number): void {
    setFooterMarginIn(value)
    scheduleSave()
  }

  function handleDifferentFirstPageChange(value: boolean): void {
    dropPageLayout()
    setDifferentFirstPage(value)
    scheduleSave()
  }

  function handlePageSizeChange(value: PageSizeKey): void {
    latestPageSetupRef.current.pageSize = value
    setPageSize(value)
    evaluatePresetDrift()
    scheduleSave()
  }

  function handleMarginsChange(value: MarginValues): void {
    latestPageSetupRef.current.margins = value
    setMargins(value)
    evaluatePresetDrift()
    scheduleSave()
  }

  function handleOrientationChange(value: PageOrientation): void {
    latestPageSetupRef.current.orientation = value
    setOrientation(value)
    scheduleSave()
  }

  /**
   * Record one formatting/structural action.
   * Structured-object actions (tables, images, code blocks) arrive with their
   * own payload and carry no useful text snapshot, so that payload is used
   * as-is. Text-format actions still get the text + mark snapshot.
   */
  function handleFormat(formatType: string, payload?: BehaviorEventPayload): void {
    const nextContent = latestContentRef.current
    latestContentRef.current = nextContent
    setContent(nextContent)
    setFormatHistory((prev) => {
      const nextHistory = [...prev, formatType]
      latestFormatHistoryRef.current = nextHistory
      return nextHistory
    })
    if (id) {
      const event = createBehaviorEvent(
        formatType,
        id,
        undefined,
        payload ?? captureFormatPayload(formatType)
      )
      api.behavior.log(event).catch((err) => console.error('Behavior log failed', err))
    }
    // Keep suggestions alive so the drawer doesn't blink shut
    scheduleSave()
    updateWordCount(nextContent)
    // Trigger sibling propagation for ANY formatting action (bold, font size, alignment, heading)
    maybeSuggestSiblingPropagation(formatType)
  }

  /**
   * Apply a format over an explicit range without moving the user's caret.
   * The range apply temporarily shifts the selection; the original selection
   * is restored afterwards so focus and cursor position stay untouched.
   */
  function applyFormatToRangePreservingSelection(format: string, from: number, to: number): void {
    if (!editor || editor.isDestroyed) return
    const previous = editor.state.selection
    applyFormatToRange(format, from, to)
    editor.chain().setTextSelection({ from: previous.from, to: previous.to }).run()
  }

  /** Shared accept tail: feedback logging, scanner dismissal, chip cleanup. */
  function finishPromptAccept(applied: string, confidence: number | undefined): void {
    setAnnouncement(`Applied ${formatSuggestionLabel(applied)}.`)
    // Dismiss the active scanner suggestion
    if (scannerActive) {
      acceptScannerSuggestion(scannerActive.key)
    }

    if (id) {
      api.behavior
        .log({
          action: `auto_preview_accepted:${applied}`,
          timestamp: new Date().toISOString(),
          documentId: id,
        })
        .catch((error) => console.error('Auto-format acceptance log failed', error))

      api.ai
        .logFeedback({
          documentId: id,
          predictionType: 'format_prompt',
          predictedFormat: applied,
          confidence,
          accepted: true,
        })
        .catch((error) => console.error('Format prompt acceptance feedback failed', error))
    }


    setFormatPrompt(null)
    setPendingLearnedFormat(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  function handlePromptAccept(format: string | FormatSuggestion): void {
    if (editor && !editor.isEditable) return
    const applied = typeof format === 'string' ? format : format.format
    const confidence =
      typeof format === 'string' ? formatPrompt?.confidence : format.confidence

    const carriesStyle =
      typeof format === 'object' &&
      !format.formatGroup &&
      (format.bold || format.italic || format.underline || format.fontSize || format.textAlign)
    if (typeof format === 'object' && (format.suggestionSource === 'learned' || carriesStyle)) {
      // Keep the applied block highlighted after accept so the user sees
      // exactly which text received the learned format.
      // A scanner suggestion formats its own block. Without this the live selection
      // would be used, and any larger selection got the bold and the highlight too.
      const scannerRange =
        suggestionRange && scannerActive && suggestionRange.from === scannerActive.from ? suggestionRange : undefined
      const appliedRange = applyLearnedFormat(format, scannerRange)
      if (appliedRange) {
        setSuggestionRange(appliedRange)
      }
    } else if (typeof format === 'object' && format.formatGroup && suggestionRange) {
      // Group chips apply over their range instead of the caret — the user's
      // cursor stays exactly where they left it (focus-preservation rule).
      applyFormatToRangePreservingSelection(applied, suggestionRange.from, suggestionRange.to)
    } else if (suggestionRange && scannerActive && suggestionRange.from === scannerActive.from) {
      // A scanner suggestion formats its own block, wherever the caret is.
      applyFormatToRangePreservingSelection(applied, suggestionRange.from, suggestionRange.to)
    } else {
      applyPromptFormat(applied)
    }
    handleFormat(applied, suggestionPayload(applied))
    finishPromptAccept(applied, confidence)
  }

  /**
   * Accept the current suggestion for every block in its format group.
   * Members apply bottom-up by range, then the highlighted first member; the
   * user's caret is restored afterwards so bulk formatting never steals focus.
   */
  function handlePromptAcceptAll(): void {
    if (!editor || !editor.isEditable) return
    const prompt = formatPrompt
    if (!prompt) return
    const format = prompt.format
    const confidence = prompt.confidence
    const members = prompt.groupMembers ?? []
    if (members.length === 0) return
    const isLearned = prompt.suggestionSource === 'learned'

    const previous = editor.state.selection
    const ordered = [...members].sort((a, b) => b.from - a.from)
    for (const member of ordered) {
      if (isLearned) {
        // Inconsistency groups must reproduce the captured modal styling on
        // every deviating block, not just its plain node type.
        applyLearnedFormat(prompt, { from: member.from, to: member.to })
      } else {
        applyFormatToRange(format, member.from, member.to)
      }
    }
    if (suggestionRange) {
      if (isLearned) applyLearnedFormat(prompt, suggestionRange)
      else applyFormatToRange(format, suggestionRange.from, suggestionRange.to)
    }
    // Focus-safe: restore the caret the user had before the bulk apply.
    editor.chain().setTextSelection({ from: previous.from, to: previous.to }).run()

    handleFormat(format, suggestionPayload(format))

    if (id) {
      api.behavior
        .log({
          action: `auto_preview_accepted_all:${format}:${members.length + 1}`,
          timestamp: new Date().toISOString(),
          documentId: id,
        })
        .catch((error) => console.error('Auto-format group acceptance log failed', error))
    }

    finishPromptAccept(format, confidence)
  }

  function rejectAutoSuggestion(format: string): void {
    const rejectedText =
      editor && !editor.isDestroyed && suggestionRange
        ? editor.state.doc.textBetween(suggestionRange.from, suggestionRange.to, ' ')
        : ''
    suppressedAutoFormatsRef.current[suppressionKey(format, rejectedText)] =
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

  }

  function handlePromptReject(): void {
    setAnnouncement('Suggestion dismissed.')
    const rejectedFormat = formatPrompt?.format ?? suggestions[0]?.format

    if (rejectedFormat) {
      rejectAutoSuggestion(rejectedFormat)
    }

    // Dismiss the active scanner suggestion
    if (scannerActive) {
      rejectScannerSuggestion(scannerActive.key)
    }

    setFormatPrompt(null)
    setPendingLearnedFormat(null)
    setSuggestions([])
    setShowSuggestions(false)
  }

  // Which page each grammar issue is on, measured after the layout settles.
  const [grammarPages, setGrammarPages] = useState<Map<GrammarIssue, number>>(new Map())
  useEffect(() => {
    if (!editor || editor.isDestroyed || grammarIssues.length === 0) {
      setGrammarPages(new Map())
      return
    }
    const timer = window.setTimeout(() => {
      if (editor.isDestroyed) return
      const pages = new Map<GrammarIssue, number>()
      for (const issue of grammarIssues.slice(0, 100)) {
        const range = locateIssue(issue)
        if (range) pages.set(issue, pageNumberAt(editor, range.from))
      }
      setGrammarPages(pages)
    }, 800)
    return () => window.clearTimeout(timer)
    // locateIssue only reads the editor, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, grammarIssues, content])

  /** Panel click on a formatting suggestion: jump to it and open its popup in the document. */
  function openScannerInDocument(suggestion: ScannerSuggestion): void {
    if (!editor || editor.isDestroyed || readOnly) return
    selectScannerSuggestion(suggestion.key)
    jumpToScannerTarget(suggestion)
    setFormatPrompt({
      format: suggestion.format,
      confidence: suggestion.confidence,
      formatGroup: suggestion.formatGroup,
      groupMembers: suggestion.groupMembers,
      label: suggestion.label,
      suggestionSource: suggestion.suggestionSource,
      ...(suggestion.captures ?? {}),
    })
  }

  /** Panel click on a learned/ML suggestion: open its popup on the block under the caret. */
  function openMlInDocument(suggestion: Suggestion): void {
    if (!editor || editor.isDestroyed || readOnly) return
    const $pos = editor.state.doc.resolve(editor.state.selection.from)
    const range = $pos.depth >= 1 ? { from: $pos.before(), to: $pos.after() } : null
    if (range) setSuggestionRange(range)
    setFormatPrompt({ ...suggestion })
    scrollToDocPos(range?.from ?? editor.state.selection.from)
  }

  /**
   * After a reference is removed, rewrite the [n] markers in the text to the new IEEE
   * numbers. Markers of the removed source become [?] so the author sees what to fix.
   * Edits run last to first so earlier positions stay valid.
   */
  function remapCitationMarkers(mapping: CitationNumberMap): void {
    if (!editor || editor.isDestroyed || !editor.isEditable) return
    const edits: Array<{ from: number; to: number; text: string }> = []
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return true
      for (const match of node.text.matchAll(/\[(\d+)\]/g)) {
        const old = Number(match[1])
        if (!mapping.has(old)) continue
        const next = mapping.get(old)
        edits.push({ from: pos + (match.index ?? 0), to: pos + (match.index ?? 0) + match[0].length, text: next == null ? '[?]' : `[${next}]` })
      }
      return true
    })
    if (edits.length === 0) return
    const tr = editor.state.tr
    for (const edit of edits.sort((a, b) => b.from - a.from)) tr.insertText(edit.text, edit.from, edit.to)
    editor.view.dispatch(tr)
  }

  /** Panel click on a grammar/spelling issue: jump to the word and open its fix popover there. */
  function openGrammarInDocument(issue: GrammarIssue): void {
    const range = locateIssue(issue)
    if (!range || !editor || editor.isDestroyed) return
    editor.chain().focus().setTextSelection(range).run()
    scrollToDocPos(range.from, 'auto')
    window.setTimeout(() => {
      if (!editor || editor.isDestroyed) return
      const start = editor.view.coordsAtPos(range.from)
      const end = editor.view.coordsAtPos(range.to)
      handleGrammarClick(
        issue,
        new DOMRect(start.left, start.top, Math.max(end.right - start.left, 12), Math.max(start.bottom - start.top, 14))
      )
    }, 150)
  }

  function handleGrammarApply(issue: GrammarIssue, suggestion?: string): void {
    setAnnouncement(`Fixed ${issue.original}.`)
    if (!editor || !editor.isEditable) return

    function preserveReplacementCase(originalText: string, replacementSuggestion: string): string {
      if (!originalText || !replacementSuggestion) return replacementSuggestion
      if (originalText === originalText.toUpperCase()) return replacementSuggestion.toUpperCase()
      if (originalText[0] === originalText[0].toUpperCase())
        return replacementSuggestion[0].toUpperCase() + replacementSuggestion.slice(1)
      return replacementSuggestion
    }

    const replacementSuggestion = suggestion ?? issue.suggestion

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
        const replacement = preserveReplacementCase(matchedText, replacementSuggestion)
        tr.replaceWith(pos + idx, pos + idx + issue.original.length, state.schema.text(replacement, node.marks))
        applied = true
      }
    })

    if (applied) {
      suppressAutoFormatRef.current = true
      dispatch(tr)
    }
    setGrammarIssues((prev) => prev.filter((i) => i !== issue))
  }

  function handleGrammarDismiss(issue: GrammarIssue): void {
    setAnnouncement(`Ignored ${issue.original}.`)
    setGrammarIssues((prev) => prev.filter((i) => i !== issue))
    setActiveGrammarIssue((active) => (active === issue ? null : active))
  }

  /** Apply a ribbon style tile at the current selection (click-to-apply). */
  function handleApplyRibbonStyle(format: string): void {
    if (!editor || !editor.isEditable) return
    applyStyleCommand(editor, format, undefined, undefined, formattingPreset)
    handleFormat(format)
    maybeSuggestSiblingPropagation(format)
  }

  /** Ribbon formats a sibling-propagation prompt is allowed to co-apply. */
  const GROUP_PROMPT_FORMATS = new Set(['h1', 'h2', 'h3', 'title', 'blockquote'])

  /** Human names for blueprint groups used in the group-format prompt label. */
  const BLUEPRINT_GROUP_LABELS: Record<string, string> = {
    author_block: 'Author Block',
  }

  /** Canonical ribbon format per propagatable structural role. */
  const ROLE_CANONICAL_FORMAT: Record<string, string> = {
    title: 'title',
    byline: 'byline',
    heading_1: 'h1',
    heading_2: 'h2',
    heading_3: 'h3',
  }

  /** Display names used in the propagation chip copy. */
  const ROLE_PROPAGATION_LABELS: Record<string, string> = {
    title: 'Title',
    byline: 'Author / Byline',
    heading_1: 'Chapter heading',
    heading_2: 'Section heading',
    heading_3: 'Subsection heading',
  }

  /** True when the node already carries the given ribbon format. */
  function isNodeStyledAs(node: ProseMirrorNode, format: string): boolean {
    if (format === 'title') return node.attrs.docRole === 'title'
    if (format === 'blockquote') return node.type.name === 'blockquote'
    return node.type.name === 'heading' && node.attrs.level === Number(format.slice(1))
  }

  /**
   * After the user formats one block, offer to format its siblings the same
   * way: blueprint guide groups first, then structural clusters (same-role
   * headings in any document — imported sabotage files have no guide attrs).
   *
   * STRICT focus rule: the user's caret/selection is never moved. The chip
   * targets the first sibling by range only; accepting applies by range too.
   */
  function maybeSuggestSiblingPropagation(format: string): void {
    if (!editor || editor.isDestroyed || readOnly) return
    if (!GROUP_PROMPT_FORMATS.has(format)) return

    const { doc, selection } = editor.state
    const $from = selection.$from
    const blockStart = $from.depth >= 1 ? $from.before($from.depth) : selection.from
    const activeBlock = doc.nodeAt(blockStart)
    if (!activeBlock) return

    // Blueprint guide groups (documents created from a preset blueprint).
    const guideGroup = activeBlock.attrs.guideGroup
    if (typeof guideGroup === 'string' && guideGroup.length > 0) {
      const groupMembers: Array<{ from: number; to: number; preview: string }> = []
      doc.descendants((node, pos) => {
        if (node.attrs.guideGroup !== guideGroup) return true
        if (pos === blockStart || isNodeStyledAs(node, format)) return true
        groupMembers.push({
          from: pos,
          to: pos + node.nodeSize,
          preview: node.textContent.trim().slice(0, 60),
        })
        return true
      })
      if (groupMembers.length === 0) return
      const first = groupMembers[0]
      setSuggestionRange({ from: first.from, to: first.to })
      setFormatPrompt({
        format,
        confidence: 88,
        label: `Format the remaining ${BLUEPRINT_GROUP_LABELS[guideGroup] ?? 'group'} elements to match?`,
        formatGroup: `blueprint-${guideGroup}`,
        groupMembers: groupMembers.slice(1),
      })
      return
    }

    // Structural clusters: same-role siblings in any document.
    const role = classifyStructuralRole(activeBlock.textContent.trim())
    if (ROLE_CANONICAL_FORMAT[role] !== format) return

    const members: Array<{ from: number; to: number; preview: string }> = []
    doc.descendants((node, pos) => {
      if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true
      if (pos === blockStart) return true
      const text = node.textContent.trim()
      if (!text || text.length > 150) return true
      if (classifyStructuralRole(text) !== role) return true
      if (isNodeStyledAs(node, format)) return true
      members.push({ from: pos, to: pos + node.nodeSize, preview: text.slice(0, 60) })
      return true
    })
    if (members.length === 0) return

    const first = members[0]
    setSuggestionRange({ from: first.from, to: first.to })
    setFormatPrompt({
      format,
      confidence: 88,
      label: `Apply this formatting to all other ${ROLE_PROPAGATION_LABELS[role]}s? (${members.length} remaining)`,
      formatGroup: `cluster-${role}`,
      groupMembers: members.slice(1),
    })
  }

  /** Resolve the active preset (if the doc uses one of the academic presets). */
  const activeAcademicPreset = ACADEMIC_PRESETS.find((p) => p.key === basePresetKey(formattingPreset))

  /* ── Blueprint drift → "save as my own version" (section 9) ────────────────
   *
   * A document that keeps a standard preset but has its page setup hand-tuned
   * is no longer that standard. Rather than silently leaving it mismatched, or
   * editing the shared standard in place, offer to fork it into a new personal
   * version — "APA 7th Edition (Custom v2)" — that only this user sees.
   */

  /** True once the user has dismissed the prompt for the current document. */
  const forkPromptDismissed = useRef(false)
  const [forkPromptOpen, setForkPromptOpen] = useState(false)
  const [forkBusy, setForkBusy] = useState(false)
  const [forkError, setForkError] = useState('')

  /* ── Two-column paper → offer the IEEE view ─────────────────────────────────
   *
   * An imported file set in two columns shows as one column in the editor. Offer the IEEE two-column
   * preview once per document; "Not now" is remembered in this browser.
   */
  const [twoColumnPromptOpen, setTwoColumnPromptOpen] = useState(false)
  const [twoColumnPreviewHtml, setTwoColumnPreviewHtml] = useState<string | null>(null)
  const twoColumnKey = id ? `intellidocs.twoColumnPrompt.${id}` : null

  useEffect(() => {
    if (!pageLayout?.two_column || readOnly || !twoColumnKey) {
      setTwoColumnPromptOpen(false)
      return
    }
    let dismissed = false
    try {
      dismissed = window.localStorage.getItem(twoColumnKey) === 'dismissed'
    } catch {
      // Storage can be blocked; the prompt then simply shows again next time.
    }
    setTwoColumnPromptOpen(!dismissed)
  }, [pageLayout?.two_column, readOnly, twoColumnKey])

  /**
   * A document with no format chosen that reads like a thesis, IEEE or APA paper gets one offer to use that
   * format for suggestions. Only the format key is set; the imported page layout is left alone.
   */
  const [typeOffer, setTypeOffer] = useState<{ presetKey: string; typeLabel: string } | null>(null)
  const typeOfferKey = id ? `intellidocs.docTypePrompt.${id}` : null
  const typeCheckedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!editor || editor.isDestroyed || !id || !typeOfferKey || readOnly || isHydrating || formattingPreset) return
    if (typeCheckedRef.current === id) return
    const text = editor.getText().trim()
    if (text.length < 200) return
    typeCheckedRef.current = id
    try {
      if (window.localStorage.getItem(typeOfferKey) === 'dismissed') return
    } catch {
      // Storage can be blocked; the offer then shows again next time.
    }
    let cancelled = false
    api.formatting
      .inferStructure(text.slice(0, 3000))
      .then((result) => {
        if (!cancelled && result.presetKey && ACADEMIC_PRESETS.some((p) => p.key === result.presetKey)) {
          setTypeOffer({ presetKey: result.presetKey, typeLabel: result.typeLabel })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [editor, id, typeOfferKey, readOnly, isHydrating, formattingPreset])

  /** Hide the document-type offer and remember that for this document. */
  function dismissTypeOffer(): void {
    setTypeOffer(null)
    try {
      if (typeOfferKey) window.localStorage.setItem(typeOfferKey, 'dismissed')
    } catch {
      // Not remembered; harmless.
    }
  }

  /** Adopt the detected format for suggestions without touching the page geometry. */
  async function acceptTypeOffer(): Promise<void> {
    if (!typeOffer) return
    const { presetKey } = typeOffer
    setFormattingPreset(presetKey)
    dismissTypeOffer()
    if (id) {
      try {
        await api.formatting.setDocumentPreset(id, presetKey)
      } catch (err) {
        console.error('Failed to persist the detected preset', err)
      }
    }
  }

  /** Hide the prompt and remember that for this document. */
  function dismissTwoColumnPrompt(): void {
    setTwoColumnPromptOpen(false)
    try {
      if (twoColumnKey) window.localStorage.setItem(twoColumnKey, 'dismissed')
    } catch {
      // Not remembered; harmless.
    }
  }

  // A freshly loaded document may already differ from its preset; re-arm the
  // check whenever the bound preset key changes.
  useEffect(() => {
    forkPromptDismissed.current = false
    setForkPromptOpen(false)
    setForkError('')
  }, [formattingPreset])

  /**
   * Compare the live page setup against the active standard blueprint and offer
   * to fork when they differ. No-ops when no standard preset is bound, when the
   * document is only viewing, or when the user already dismissed the prompt.
   */
  function evaluatePresetDrift(): void {
    const preset = ACADEMIC_PRESETS.find((p) => p.key === formattingPreset)
    if (!preset || readOnly || forkPromptDismissed.current) return

    const setup = latestPageSetupRef.current
    const drifted = hasDriftedFromPreset(preset, {
      pageSize: setup.pageSize,
      margins: setup.margins,
    })

    setForkPromptOpen(drifted)
  }

  /**
   * Fork the active standard blueprint into a new personal version and rebind
   * the document to it. The version number is assigned server-side, so repeated
   * forks of one blueprint yield v2, v3, v4 rather than colliding.
   */
  async function handleForkPreset(): Promise<void> {
    const baseKey = formattingPreset
    if (!baseKey || !id) return

    setForkBusy(true)
    setForkError('')
    try {
      const fork = await api.formatting.createUserPreset({ baseKey })
      setFormattingPreset(fork.key)
      forkPromptDismissed.current = true
      setForkPromptOpen(false)
      scheduleSave()
    } catch (err) {
      setForkError(err instanceof Error ? err.message : 'Could not save your version')
    } finally {
      setForkBusy(false)
    }
  }

  /** Dismiss the prompt and stay on the standard preset. */
  function handleDismissForkPrompt(): void {
    forkPromptDismissed.current = true
    setForkPromptOpen(false)
    setForkError('')
  }

  /** One-click academic preset: page geometry + scoped typography + persisted preset key. */
  async function handleApplyAcademicPreset(key: string): Promise<void> {
    const preset = ACADEMIC_PRESETS.find((p) => p.key === key)
    if (!preset) return
    setPageSize(preset.pageSize)
    setMargins({ ...preset.margins })
    setOrientation(preset.orientation)
    setFormattingPreset(key)
    // Switching preset restyles the captions and, for IEEE, the citation style.
    if (editor && !editor.isDestroyed) editor.commands.setCaptionLabelStyle(basePresetKey(key) === 'ieee' ? 'ieee' : 'default')
    if (basePresetKey(key) === 'ieee') setCitationStyle('ieee')
    if (id) {
      try {
        await api.formatting.setDocumentPreset(id, key)
      } catch (err) {
        console.error('Failed to persist academic preset', err)
      }
    }
    // Persist the preset's page geometry and log a snapshot with the format state.
    scheduleSave()
  }

  /** Grammar underline click — open the anchored fix popover. */
  const handleGrammarClick = useCallback(
    (issue: GrammarIssue, rect: DOMRect): void => {
      setActiveGrammarIssue(issue)
      setActiveGrammarRect(rect)
    },
    []
  )

  /** Locate the ProseMirror position of a grammar issue's text in the document. */
  function findIssuePos(issue: GrammarIssue): number | null {
    if (!editor || editor.isDestroyed) return null
    const needle = issue.original.toLowerCase()
    let found: number | null = null
    editor.state.doc.descendants((node, pos) => {
      if (found !== null) return false
      if (node.isText && node.text) {
        const idx = node.text.toLowerCase().indexOf(needle)
        if (idx >= 0) found = pos + idx
      }
      return found === null
    })
    return found
  }

  /**
   * Find where a grammar/spelling issue sits: the whole phrase inside one text
   * block, else the longest leading run of its words (an issue can span blocks
   * because the checker reads the document as one stream of text).
   */
  function locateIssue(issue: GrammarIssue): { from: number; to: number } | null {
    if (!editor || editor.isDestroyed) return null
    const words = issue.original.trim().split(/\s+/)
    for (let count = words.length; count >= 1; count -= 1) {
      const needle = words.slice(0, count).join(' ').toLowerCase()
      if (needle.length < 2) continue
      let found: { from: number; to: number } | null = null
      editor.state.doc.descendants((node, pos) => {
        if (found) return false
        if (!node.isTextblock) return true
        const index = node.textContent.toLowerCase().indexOf(needle)
        if (index >= 0) found = { from: pos + 1 + index, to: pos + 1 + index + needle.length }
        return false
      })
      if (found) return found
    }
    return null
  }

  /** Build a viewport rect for a grammar issue so the fix popover can anchor to it. */
  function buildIssueRect(issue: GrammarIssue): DOMRect | null {
    const pos = findIssuePos(issue)
    if (pos === null || !editor || editor.isDestroyed) return null
    const start = editor.view.coordsAtPos(pos)
    const end = editor.view.coordsAtPos(pos + issue.original.length)
    return new DOMRect(
      start.left,
      start.top,
      Math.max(end.right - start.left, 12),
      Math.max(start.bottom - start.top, 14)
    )
  }

  /** Grammar/spelling issues whose text falls inside the highlighted suggestion block. */
  const issuesOnRange = useCallback((): GrammarIssue[] => {
    if (!editor || editor.isDestroyed || !suggestionRange) return []
    const blockText = editor.state.doc
      .textBetween(suggestionRange.from, suggestionRange.to, ' ')
      .toLowerCase()
    return grammarIssues.filter((issue) => issue.original && blockText.includes(issue.original.toLowerCase()))
  }, [editor, suggestionRange, grammarIssues])

  /** Open the formatting suggestion popup (chip) for the active suggestion. */
  function openFormattingPopup(): void {
    setActionsMenu(null)
    if (pendingLearnedFormat) {
      setFormatPrompt(pendingLearnedFormat)
      setPendingLearnedFormat(null)
      return
    }
    if (scannerActive) {
      setFormatPrompt({
        format: scannerActive.format,
        confidence: scannerActive.confidence,
        formatGroup: scannerActive.formatGroup,
        groupMembers: scannerActive.groupMembers,
        label: scannerActive.label,
        suggestionSource: scannerActive.suggestionSource,
        ...(scannerActive.captures ?? {}),
      })
    }
  }

  /** Open the grammar fix popover for the first issue on the highlighted line. */
  function openGrammarFromMenu(): void {
    const issues = issuesOnRange()
    const first = issues[0]
    setActionsMenu(null)
    if (first) {
      const rect = buildIssueRect(first)
      if (rect) handleGrammarClick(first, rect)
    }
  }

  /**
   * Clicking the outlined text opens a chooser when BOTH formats + grammar are
   * present. `rect` comes from the decoration wrapper itself, so the anchor is
   * already in viewport space and matches what the menu expects.
   */
  function handleOverlayOpen(rect: DOMRect): void {
    if (issuesOnRange().length > 0) {
      setActionsMenu({ x: rect.left, y: rect.top })
    } else if (pendingLearnedFormat) {
      // Learned cross-document match clicked: promote the highlight to the chip.
      setFormatPrompt(pendingLearnedFormat)
      setPendingLearnedFormat(null)
    } else {
      openFormattingPopup()
    }
  }

  // Outlined-block clicks are forwarded from every page editor by the
  // paginated view, matching how grammar underlines are handled. A ref keeps
  // the handler current without resubscribing on every render.
  const overlayOpenRef = useRef(handleOverlayOpen)
  overlayOpenRef.current = handleOverlayOpen

  useEffect(() => {
    if (!editor) return
    const onOverlayClick = (payload: { rect: DOMRect }): void => overlayOpenRef.current(payload.rect)
    editor.on('suggestion-overlay-click', onOverlayClick)
    return () => {
      editor.off('suggestion-overlay-click', onOverlayClick)
    }
  }, [editor])

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

  // Chip metadata: the chip's counter tracks the highlighted suggestion's queue
  // position, while the up/down arrows cycle the "change to" alternatives.
  const queuePosition = scannerActive
    ? scannerSuggestions.findIndex((s) => s.key === scannerActive.key) + 1
    : 0
  const queueTotal = scannerActive ? scannerSuggestions.length : 0
  const chipAlternatives = formatPrompt
    ? SUGGESTION_ALTERNATIVES[formatPrompt.format] ?? [formatPrompt.format]
    : []
  const altPosition = formatPrompt ? chipAlternatives.indexOf(formatPrompt.format) : 0
  const cycleNextLabel = altPosition >= 0 && altPosition < chipAlternatives.length - 1
    ? formatSuggestionLabel(chipAlternatives[altPosition + 1])
    : undefined
  const cyclePrevLabel = altPosition > 0 ? formatSuggestionLabel(chipAlternatives[altPosition - 1]) : undefined

  /** Jump to the currently highlighted suggestion (chip → locate button). */
  const handleChipJump = useCallback((): void => {
    if (scannerActive) jumpToScannerTarget(scannerActive)
  }, [scannerActive, jumpToScannerTarget])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden', backgroundColor: 'var(--background)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-md border-b border-border/80 flex-shrink-0 transition-all">
        {/* Main nav row */}
        <div className="flex items-center justify-between h-14 px-4 sm:px-6 gap-3">
          {/* Left: back + brand + outline */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              to="/dashboard"
              aria-label="Back to dashboard"
              className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <LogoLockup size={24} />

            {/* Left panel (Outline) toggle button */}
            <button
              type="button"
              onClick={() => setLeftPanelOpen((open) => !open)}
              title={leftPanelOpen ? 'Hide outline (Ctrl+Shift+\\)' : 'Show outline (Ctrl+Shift+\\)'}
              aria-label={leftPanelOpen ? 'Hide outline' : 'Show outline'}
              aria-pressed={leftPanelOpen}
              className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors ${
                leftPanelOpen
                  ? 'bg-secondary text-foreground border-border'
                  : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              {leftPanelOpen ? <PanelLeftClose className="size-3.5" /> : <PanelLeft className="size-3.5" />}
              <span className="hidden sm:inline">Outline</span>
            </button>
          </div>

          {/* Center: inline document title */}
          <div className="flex-1 max-w-md mx-auto">
            <input
              value={title}
              onChange={handleTitleChange}
              readOnly={readOnly}
              placeholder="Untitled Document"
              className="w-full text-center text-sm font-semibold text-foreground bg-transparent hover:bg-secondary/40 focus:bg-background border border-transparent focus:border-border rounded-lg px-3 py-1 transition-all outline-none tracking-tight"
            />
          </div>

          {/* Right: save status + actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Live collaborator avatars */}
            {remotePresence.size > 0 && (
              <div className="flex items-center -space-x-1.5 mr-1">
                {Array.from(remotePresence.values())
                  .sort((a, b) => (a.user_id === user?.id ? -1 : b.user_id === user?.id ? 1 : 0))
                  .slice(0, 4)
                  .map((entry) => {
                    const isSelf = entry.user_id === user?.id
                    const isOwner = entry.user_id === docOwnerId
                    const label = `${entry.display_name}${isSelf ? ' (You)' : isOwner ? ' (Owner)' : ' (Collaborator)'} — Editing now`
                    return (
                      <button
                        key={entry.user_id}
                        type="button"
                        title={label}
                        className="size-6 rounded-full border-2 border-card text-white text-[10px] font-bold flex items-center justify-center shadow-xs cursor-default"
                        style={{ backgroundColor: entry.color }}
                      >
                        {avatarInitials(entry.display_name)}
                      </button>
                    )
                  })}
                {remotePresence.size > 4 && (
                  <span className="text-[11px] font-bold text-muted-foreground pl-1">
                    +{remotePresence.size - 4}
                  </span>
                )}
              </div>
            )}

            {/* Save status pill */}
            <div
              title={storageFull ? 'Your storage is full. Delete documents or empty the Trash to keep saving; your edits are kept on this device.' : undefined}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                saveStatus === 'saving'
                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                  : saveStatus === 'error'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  saveStatus === 'saving'
                    ? 'bg-blue-500 animate-pulse'
                    : saveStatus === 'error'
                      ? 'bg-rose-500'
                      : 'bg-emerald-500'
                }`}
              />
              <span className="text-[11px]">
                {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'unsaved' ? 'Unsaved' : saveStatus === 'error' ? (storageFull ? 'Storage full' : 'Save failed') : 'Saved'}
              </span>
            </div>

            {/* Offline sync status */}
            <OfflineIndicator />

            {/* Isolation Toggle */}
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
              className={`inline-flex items-center justify-center size-8 rounded-lg border transition-colors ${
                isIsolated
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground'
              }`}
            >
              {isIsolated ? <ShieldOff className="size-4" strokeWidth={1.75} /> : <Shield className="size-4" strokeWidth={1.75} />}
            </button>

            {/* Originality check opens its own view-only page */}
            {id && !readOnly && (
              <Link
                to={`/document/${id}/originality`}
                title="Check originality against your other documents"
                className="inline-flex items-center justify-center size-8 rounded-lg border border-transparent bg-transparent text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <ShieldCheck className="size-4" strokeWidth={1.75} />
              </Link>
            )}

            {/* Share action */}
            {!readOnly && docOwnerId && user?.id === docOwnerId && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                title="Share this document"
                className="btn-primary h-8 px-3 text-xs gap-1.5 shadow-sm"
              >
                <Share2 className="size-3.5" />
                <span>Share</span>
              </button>
            )}

            {/* Assistant toggle */}
            <button
              type="button"
              onClick={() => setRightPanelOpen((open) => !open)}
              title="Toggle assistant panel (Ctrl+\\)"
              className={`flex items-center justify-center size-8 rounded-lg border transition-colors ${
                rightPanelOpen
                  ? 'bg-secondary text-foreground border-border'
                  : 'bg-transparent text-muted-foreground border-transparent hover:bg-secondary hover:text-foreground'
              }`}
            >
              {rightPanelOpen ? <PanelRightClose className="size-4" strokeWidth={1.75} /> : <PanelRight className="size-4" strokeWidth={1.75} />}
            </button>
          </div>
        </div>

        {/* Toolbar row — overflow visible with z-index so popovers float above canvas */}
        {!readOnly && (
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
              headerPlacement={headerPlacement}
              footerPlacement={footerPlacement}
              onHeaderPlacementChange={handleHeaderPlacementChange}
              onFooterPlacementChange={handleFooterPlacementChange}
              headerMarginIn={headerMarginIn}
              footerMarginIn={footerMarginIn}
              onHeaderMarginChange={handleHeaderMarginChange}
              onFooterMarginChange={handleFooterMarginChange}
              differentFirstPage={differentFirstPage}
              onDifferentFirstPageChange={handleDifferentFirstPageChange}
              onApplyStyle={handleApplyRibbonStyle}
              onApplyPreset={(key) => { void handleApplyAcademicPreset(key) }}
              activePreset={formattingPreset}
              spreadPreview={spreadPreview}
              onSpreadPreviewChange={setSpreadPreview}
              showGridlines={showGridlines}
              onShowGridlinesChange={setShowGridlines}
              pageSetupFocusRequest={pageSetupFocusRequest}
              onPageSetupFocusHandled={handlePageSetupFocusHandled}
              onOpenPersonalization={() => setProfileModalOpen(true)}
            />
          </div>
        )}
      </header>

      {/* Read-only banner — shown for trash documents or share-link visitors */}
      {readOnly && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--secondary)',
            fontSize: '0.8125rem',
            color: 'var(--foreground)',
            flexShrink: 0,
          }}
        >
          <Shield style={{ width: '14px', height: '14px' }} />
          {viewOnly ? (
            <span>View only — you are seeing this document through a share link.</span>
          ) : (
            <>
              <span>View only — this document is in trash. Restore it to edit again.</span>
              <button
                type="button"
                onClick={() => { void handleRestoreFromReadonly() }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: '28px',
                  padding: '0 0.75rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Restore document
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────── */}
      <div className={`workspace-grid ${leftPanelOpen ? 'has-left-panel' : ''}`}>

        {/* Left panel — Outline Navigator */}
        <aside
          className={`left-panel transition-all duration-200 ease-in-out ${leftPanelCollapsed ? 'collapsed' : ''}`}
          style={{
            zIndex: 30,
            width: leftPanelOpen ? undefined : 0,
            minWidth: leftPanelOpen ? undefined : 0,
            maxWidth: leftPanelOpen ? undefined : 0,
            opacity: leftPanelOpen ? 1 : 0,
            transform: leftPanelOpen ? 'translateX(0)' : 'translateX(-1rem)',
            borderRight: leftPanelOpen ? undefined : 'none',
            pointerEvents: leftPanelOpen ? 'auto' : 'none',
            transition:
              'width 200ms ease-in-out, min-width 200ms ease-in-out, max-width 200ms ease-in-out, opacity 200ms ease-in-out, transform 200ms ease-in-out',
          }}
        >
          <OutlineNavigator
            content={content}
            editor={editor}
            activeHeadingId={activeHeadingId}
            onActiveHeadingChange={setActiveHeadingId}
            onHeadingClick={handleOutlineHeadingClick}
            collapsed={leftPanelCollapsed}
            onCollapseChange={setLeftPanelCollapsed}
            onClose={() => setLeftPanelOpen(false)}
            maxDepth={3}
          />
        </aside>

        {/* Editor area — clean TipTap paper sheet */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div
            ref={editorCanvasRef}
            className={prefs.showStyleGuides ? 'guide-boundary' : undefined}
            style={{
              position: 'relative',
              flex: 1,
              overflowY: 'auto',
              // The paginator re-lays out the pages above the caret on every edit. With scroll
              // anchoring on, Chrome shifts the view to follow that reflow: one keystroke could
              // move the page thousands of pixels, often to the end of the document.
              overflowAnchor: 'none',
              backgroundColor: 'var(--canvas-bg)',
              padding: '2rem 1rem',
              ['--agentic-pulse-color' as string]: highlightColorCss(prefs),
            }}
            onDragOver={(e) => {
              e.preventDefault()
            }}
            onDrop={(e) => {
              e.preventDefault()
              const styleFormat = e.dataTransfer.getData('application/x-intellidocs-style')
              const presetKey = e.dataTransfer.getData('application/x-intellidocs-preset')
              if (styleFormat) {
                handleApplyRibbonStyle(styleFormat)
              } else if (presetKey) {
                void handleApplyAcademicPreset(presetKey)
              }
            }}
          >
            {/* Outline-jump spotlight: React-managed, so ProseMirror view
                updates can never remove the flash mid-animation. */}
            {flashCoords && (
              <div
                key={flashKey}
                aria-hidden="true"
                className="heading-flash-overlay"
                style={{
                  position: 'absolute',
                  top: `${flashCoords.top}px`,
                  left: `${flashCoords.left}px`,
                  width: `${flashCoords.width}px`,
                  height: `${flashCoords.height}px`,
                }}
              />
            )}
            {/* Quick-open Outline Tab when outline is hidden */}
            {!leftPanelOpen && (
              <button
                type="button"
                onClick={() => setLeftPanelOpen(true)}
                title="Show outline (Ctrl+Shift+\\)"
                aria-label="Show outline"
                style={{
                  position: 'sticky',
                  top: '0.25rem',
                  left: '0.25rem',
                  float: 'left',
                  zIndex: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.375rem 0.625rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--foreground)',
                  boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  transition: 'background-color 150ms, box-shadow 150ms',
                }}
              >
                <PanelLeft style={{ width: '14px', height: '14px', color: 'var(--primary)' }} />
                <span>Outline</span>
              </button>
            )}
            {activeAcademicPreset && <style>{activeAcademicPreset.css}</style>}
            <PagedEditor
              content={content}
              onContentChange={handleContentChange}
              onActiveEditorChange={setEditor}
              onGrammarClick={handleGrammarClick}
              grammarIssues={grammarIssues}
              underlineStyle={prefs.underlineStyle}
              pageSize={pageSize}
              margins={margins}
              orientation={orientation}
              headerFooterConfig={headerFooterConfig}
              pageLayout={pageLayout}
              spreadPreview={spreadPreview}
              zoomLevel={zoomLevel}
              showGridlines={showGridlines}
              onHydrationChange={setIsHydrating}
              onHeaderFooterActivate={handleHeaderFooterActivate}
              onFormatApplied={handleFormat}
            />

            {/* Word-style canvas zoom control, pinned bottom-right of the canvas */}
            <DocumentZoomWidget
              zoomLevel={zoomLevel}
              onZoomChange={applyZoom}
              onFitWidth={handleFitWidth}
            />

          </div>


          {/* Academic word & page target progress widget (plan point 25) */}
          {!readOnly && (
            <WordProgress
              wordCount={wordCount}
              targetWords={3000}
              wordsPerPage={pageSize === 'a4' ? 300 : 275}
            />
          )}

          {/* Unsaved edits from an earlier session */}
          {recoveredDraft && !readOnly && (
            <div
              role="status"
              style={{
                position: 'fixed',
                bottom: '7.5rem',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(32rem, calc(100vw - 2rem))',
                zIndex: 41,
                padding: '0.75rem 0.875rem',
                borderRadius: '0.625rem',
                border: '1px solid var(--border)',
                borderLeft: '3px solid var(--primary)',
                backgroundColor: 'var(--card)',
                boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
              }}
            >
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--foreground)' }}>
                We found unsaved changes from {new Date(recoveredDraft.savedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--muted-foreground)' }}>
                They never reached the server. Restore them, or keep the saved version.
              </p>
              <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.625rem' }}>
                <button
                  type="button"
                  onClick={restoreRecoveredDraft}
                  style={{ height: '1.875rem', padding: '0 0.75rem', borderRadius: '0.4375rem', border: 'none', background: 'var(--primary)', color: 'var(--primary-foreground)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Restore my changes
                </button>
                <button
                  type="button"
                  onClick={discardRecoveredDraft}
                  style={{ height: '1.875rem', padding: '0 0.75rem', borderRadius: '0.4375rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Keep saved version
                </button>
              </div>
            </div>
          )}

          {/* The document names fonts this computer does not have */}
          {missingDocFonts.length > 0 && (
            <div
              role="status"
              style={{
                position: 'fixed',
                bottom: '3.25rem',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(34rem, calc(100vw - 2rem))',
                zIndex: 41,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '0.625rem 0.875rem',
                borderRadius: '0.625rem',
                border: '1px solid var(--border)',
                borderLeft: '3px solid var(--primary)',
                backgroundColor: 'var(--card)',
                boxShadow: '0 6px 18px rgba(0, 0, 0, 0.12)',
              }}
            >
              <p style={{ margin: 0, flex: 1, fontSize: '0.75rem', lineHeight: 1.45, color: 'var(--foreground)' }}>
                This document uses {missingDocFonts.slice(0, 3).join(', ')}
                {missingDocFonts.length > 3 ? ` and ${missingDocFonts.length - 3} more` : ''}, which {missingDocFonts.length === 1 ? "isn't" : "aren't"} on this
                computer. A similar font is shown, so line breaks and page breaks may differ from the original.
              </p>
              <button
                type="button"
                onClick={() => {
                  dismissFontNotice(id)
                  setMissingDocFonts([])
                }}
                style={{ height: '1.625rem', padding: '0 0.625rem', borderRadius: '0.4375rem', border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Page setup drifted from the standard blueprint — offer a fork */}
          {forkPromptOpen && activeAcademicPreset && (
            <div
              style={{
                position: 'fixed',
                bottom: '7.5rem',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(32rem, calc(100vw - 2rem))',
                zIndex: 40,
              }}
            >
              <PresetForkPrompt
                baseName={activeAcademicPreset.name}
                driftedOn="Your page setup"
                onFork={handleForkPreset}
                onDismiss={handleDismissForkPrompt}
                busy={forkBusy}
                error={forkError}
              />
            </div>
          )}

          {/* An imported two-column paper — offer the IEEE two-column preview */}
          {twoColumnPromptOpen && (
            <div
              style={{
                position: 'fixed',
                bottom: '7.5rem',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(32rem, calc(100vw - 2rem))',
                zIndex: 40,
              }}
            >
              <TwoColumnPrompt
                onPreview={() => {
                  setTwoColumnPreviewHtml(editor?.getHTML() ?? content)
                  dismissTwoColumnPrompt()
                }}
                onDismiss={dismissTwoColumnPrompt}
              />
            </div>
          )}
          {/* An opened file that reads like a known paper type — offer its format for suggestions */}
          {typeOffer && !twoColumnPromptOpen && (
            <div
              style={{
                position: 'fixed',
                bottom: '7.5rem',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'min(32rem, calc(100vw - 2rem))',
                zIndex: 40,
              }}
            >
              <DocumentTypePrompt
                typeLabel={typeOffer.typeLabel}
                presetName={ACADEMIC_PRESETS.find((p) => p.key === typeOffer.presetKey)?.name ?? typeOffer.typeLabel}
                onApply={() => void acceptTypeOffer()}
                onDismiss={dismissTypeOffer}
              />
            </div>
          )}
          {twoColumnPreviewHtml !== null && (
            <IeeePrintPreview html={twoColumnPreviewHtml} onClose={() => setTwoColumnPreviewHtml(null)} />
          )}

        </main>

        {/* Right panel — docked editor assistant with suggestions queue */}
        <EditorSidePanel
          open={rightPanelOpen}
          compact={isNarrow}
          activeTab={sidePanelTab}
          onToggle={() => setRightPanelOpen((open) => !open)}
          onTabChange={setSidePanelTab}
          editor={editor}
          documentId={id}
          documentTitle={title}
          documentContent={chatContent}
          currentHtml={content}
          scannerSuggestions={scannerSuggestions}
          activeScannerKey={scannerActive?.key ?? null}
          mlSuggestions={showSuggestions ? suggestions : []}
          grammarIssues={grammarIssues}
          grammarLoading={grammarCheck.loading}
          grammarError={grammarCheck.error}
          grammarCheckedAt={grammarCheck.lastCheckedAt}
          grammarPages={grammarPages}
          onCheckGrammar={() => void grammarCheck.runCheck()}
          onOpenScanner={openScannerInDocument}
          onOpenMl={openMlInDocument}
          onOpenGrammar={openGrammarInDocument}
          formattingEnabled={prefs.formattingSuggestions}
          grammarEnabled={prefs.grammarSuggestions}
          onFormattingEnabledChange={(value) => setEditorPreferences({ formattingSuggestions: value })}
          onGrammarEnabledChange={(value) => setEditorPreferences({ grammarSuggestions: value })}
          onFocusEditor={focusEditor}
          onOpenHelp={() => setHelpOpen(true)}
          readOnly={readOnly}
          onVersionRestored={(version) => {
            // Push the restored snapshot back into both the editor and the
            // page state so the canvas reflects the restored history point.
            const snapshot = readFormatSnapshot(version.editor_prefs)
            latestTitleRef.current = version.title
            setTitle(version.title)
            setContent(version.content)
            handleContentChange(version.content)
            if (version.page_size) {
              latestPageSetupRef.current.pageSize = version.page_size
              setPageSize(version.page_size)
            }
            if (version.margins) {
              latestPageSetupRef.current.margins = version.margins
              setMargins(version.margins)
            }
            if (version.orientation) {
              latestPageSetupRef.current.orientation = version.orientation
              setOrientation(version.orientation)
            }
            latestHeaderRef.current = snapshot.header_content
            latestFooterRef.current = snapshot.footer_content
            setHeaderContent(snapshot.header_content)
            setFooterContent(snapshot.footer_content)
            latestHeaderSettingsRef.current = {
              showHeader: snapshot.show_header,
              showFooter: snapshot.show_footer,
              headerNumberFormat: snapshot.header_number_format,
              footerNumberFormat: snapshot.footer_number_format,
            }
            setShowHeader(snapshot.show_header)
            setShowFooter(snapshot.show_footer)
            setHeaderNumberFormat(snapshot.header_number_format)
            setFooterNumberFormat(snapshot.footer_number_format)
            latestFormatHistoryRef.current = snapshot.formatting_history
            setFormatHistory(snapshot.formatting_history)
            setFormattingPreset(snapshot.formatting_preset)
          }}
          toolsSection={
            <>
              <DocumentPartsPanel editor={editor} readOnly={readOnly} />


              <CitationAssistant
                editor={editor}
                citationStyle={citationStyle}
                onStyleChange={setCitationStyle}
                references={references}
                onReferencesChange={setReferences}
                onCitationNumbersChanged={remapCitationMarkers}
                onInsertBibliography={(entries) => {
                  if (!editor || !editor.isEditable) return
                  // Fill the document's own References heading when it has one, instead of adding a second title.
                  const heading = referencesHeadingEnd(editor)
                  if (heading && !editor.getHTML().includes('data-generated="refs"')) {
                    const range = heading.placeholder ?? { from: heading.at, to: heading.at }
                    editor.chain().focus().insertContentAt(range, buildReferenceNodes(entries, false)).run()
                    return
                  }
                  insertOrUpdateGenerated(editor, 'refs', buildReferenceNodes(entries, !heading))
                }}
                onInsertCitation={(citationText: string) => {
                  if (editor) {
                    editor.chain().focus().insertContent(citationText).run()
                  }
                }}
              />
            </>
          }
        />
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

      {/* Chooser when the highlighted line has both formatting + grammar/spelling */}
      {actionsMenu && (
        <SuggestionActionsMenu
          anchor={actionsMenu}
          formattingLabel={formatSuggestionLabel(pendingLearnedFormat?.format ?? scannerActive?.format ?? '')}
          grammarCount={issuesOnRange().length}
          onFormatting={openFormattingPopup}
          onGrammar={openGrammarFromMenu}
          onClose={() => setActionsMenu(null)}
        />
      )}

      {/* Inline suggestion chip — anchored above the highlighted block */}
      {!readOnly && showFormatOverlays && formatPrompt && suggestionRange && suggestionAnchor && (
        <InlineSuggestionChip
          anchor={suggestionAnchor}
          label={formatPrompt.label ?? formatSuggestionLabel(formatPrompt.format)}
          confidence={formatPrompt.confidence}
          source={describeSuggestionSource(formatPrompt)}
          previewMode={previewMode}
          previewAvailable={previewStyle !== null}
          onPreviewModeChange={setPreviewMode}
          reason={describeSuggestionReason(formatPrompt)}
          queuePosition={queuePosition}
          queueTotal={queueTotal}
          nextLabel={cycleNextLabel}
          prevLabel={cyclePrevLabel}
          similarCount={formatPrompt.groupMembers?.length ?? 0}
          groupMembers={formatPrompt.groupMembers}
          onAcceptAll={
            formatPrompt.groupMembers && formatPrompt.groupMembers.length > 0
              ? handlePromptAcceptAll
              : undefined
          }
          onChangeTo={cycleSuggestionFormat}
          onJump={handleChipJump}
          onAccept={() => handlePromptAccept(formatPrompt)}
          onReject={handlePromptReject}
        />
      )}

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>

      {shareOpen && id && (
        <ShareModal documentId={id} onClose={() => setShareOpen(false)} />
      )}

      <PersonalizationProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
      />
    </div>
  )
}
