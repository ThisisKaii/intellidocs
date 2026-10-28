import { useState, type CSSProperties, type ReactNode } from 'react'
import type { Editor } from '@tiptap/react'
import type { LucideIcon } from 'lucide-react'
import { Search, Plus, Loader2, FileText, BookOpen, Globe, GraduationCap, FileCode, Trash2, Copy, Edit2 } from 'lucide-react'
import {
  panelStyle,
  tabsStyle,
  tabStyle,
  styleSelectorStyle,
  labelStyle,
  selectStyle,
  contentStyle,
  searchStyle,
  emptyStyle,
  listStyle,
  itemStyle,
  refRowStyle,
  refTypeIconStyle,
  refInfoStyle,
  refTitleStyle,
  refMetaStyle,
  insertButtonStyle,
  actionsStyle,
  actionButtonStyle,
  manageHeaderStyle,
  manageTitleStyle,
  addButtonStyle,
  groupStyle,
  groupLabelStyle,
  bibliographyHeaderStyle,
  bibliographyListStyle,
  bibliographyItemStyle,
  dialogOverlayStyle,
  dialogStyle,
  dialogHeaderStyle,
  dialogTitleStyle,
  closeButtonStyle,
  dialogContentStyle,
  formGroupStyle,
  authorRowStyle,
  inputStyle,
  removeAuthorButtonStyle,
  addAuthorButtonStyle,
  dialogFooterStyle,
  cancelButtonStyle,
  saveButtonStyle,
} from './CitationAssistantStyles'
import { api } from '@/services/api'
import {
  CITATION_STYLE_LABELS,
  formatBibliographyEntry,
  formatInTextCitation,
  generateCitationKey,
  orderForBibliography,
  removeReferenceAndRenumber,
  type CitationNumberMap,
  sortReferences,
  type CitationReference,
  type CitationStyle,
} from '@/lib/citationFormats'

export type { CitationReference, CitationStyle } from '@/lib/citationFormats'

const TYPE_LABELS: Record<CitationReference['type'], string> = {
  journal: 'Journal Article',
  book: 'Book',
  conference: 'Conference Paper',
  website: 'Website',
  thesis: 'Thesis/Dissertation',
  report: 'Report',
  other: 'Other',
}

const TYPE_ICONS: Record<CitationReference['type'], LucideIcon> = {
  journal: FileText,
  book: BookOpen,
  conference: FileCode,
  website: Globe,
  thesis: GraduationCap,
  report: FileText,
  other: FileText,
}

/** Group references by type for organized bibliography. */
function groupReferencesByType(references: CitationReference[]): Record<string, CitationReference[]> {
  const groups: Record<string, CitationReference[]> = {}
  for (const ref of references) {
    const type = ref.type || 'other'
    if (!groups[type]) groups[type] = []
    groups[type].push(ref)
  }
  return groups
}

type CitationTab = 'insert' | 'manage' | 'bibliography'

/** The tabs in the order they are used, each with a one-line description of what it is for. */
const CITATION_TABS: { id: CitationTab; label: string; summary: string }[] = [
  { id: 'manage', label: 'Manage', summary: 'Add the sources you are using: look one up by DOI, link or title, or type it in.' },
  { id: 'insert', label: 'Insert', summary: 'Put the cursor in your text, then press + next to a source to cite it there.' },
  { id: 'bibliography', label: 'Bibliography', summary: 'Builds the References list from your sources. Add it to the end of your document.' },
]

/** Start on Manage until there is a source to cite, then on Insert where citing happens. */
export function defaultCitationTab(referenceCount: number): CitationTab {
  return referenceCount === 0 ? 'manage' : 'insert'
}

/** A small link-style button that moves to another tab. */
const nextStepButtonStyle: CSSProperties = {
  marginTop: '0.625rem',
  padding: '0.375rem 0.625rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: 'var(--primary)',
  backgroundColor: 'transparent',
  border: '1px solid var(--primary)',
  borderRadius: '0.375rem',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

interface CitationAssistantProps {
  /** Editor instance for inserting citations. */
  editor: Editor | null
  /** Current citation style for the document. */
  citationStyle: CitationStyle
  /** Called when citation style changes. */
  onStyleChange?: (style: CitationStyle) => void
  /** Existing references in the document. */
  references?: CitationReference[]
  /** Called when references are updated. */
  onReferencesChange?: (refs: CitationReference[]) => void
  /** Insert mode callback - called when user wants to insert a citation at cursor. */
  onInsertCitation?: (citationText: string) => void
  /** Called when removing a reference changes IEEE numbers: the text's [n] markers must follow. */
  onCitationNumbersChanged?: (mapping: CitationNumberMap) => void
  /** Put the formatted bibliography into the document as a References block. */
  onInsertBibliography?: (entriesHtml: string[]) => void
}

export function CitationAssistant({
  editor,
  citationStyle,
  onStyleChange,
  references = [],
  onReferencesChange,
  onInsertCitation,
  onInsertBibliography,
  onCitationNumbersChanged,
}: CitationAssistantProps): ReactNode {
  const [searchQuery, setSearchQuery] = useState('')
  const [lookupQuery, setLookupQuery] = useState('')
  const [lookupState, setLookupState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null })
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [editingRef, setEditingRef] = useState<CitationReference | null>(null)
  const [activeTab, setActiveTab] = useState<CitationTab>(() => defaultCitationTab(references.length))
  const [newRef, setNewRef] = useState<CitationReference>({
    id: '',
    type: 'journal',
    authors: [''],
    title: '',
    year: new Date().getFullYear(),
  })

  const filteredRefs = references.filter((ref) =>
    ref.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ref.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
    ref.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const sortedRefs = sortReferences(filteredRefs)
  const bibliographyRefs = orderForBibliography(references, citationStyle)
  const groupedRefs = groupReferencesByType(sortedRefs)

  const handleAddReference = () => {
    const ref: CitationReference = {
      ...newRef,
      id: newRef.id || generateCitationKey(newRef),
    }
    const updated = [...references, ref]
    onReferencesChange?.(updated)
    setNewRef({ id: '', type: 'journal', authors: [''], title: '', year: new Date().getFullYear() })
    setShowAddDialog(false)
  }

  /** Fill the Add Reference form from a DOI, link or title found by the server. */
  const handleLookup = async (): Promise<void> => {
    const query = lookupQuery.trim()
    if (query.length < 3) return
    setLookupState({ busy: true, message: null })
    try {
      const found = await api.citations.lookup(query)
      setEditingRef(null)
      setNewRef({ ...found, id: '' })
      setShowAddDialog(true)
      setLookupQuery('')
      setLookupState({ busy: false, message: null })
    } catch (error) {
      setLookupState({ busy: false, message: error instanceof Error ? error.message : 'Lookup failed.' })
    }
  }

  const handleUpdateReference = () => {
    if (!editingRef) return
    const updated = references.map((r) => (r.id === editingRef.id ? editingRef : r))
    onReferencesChange?.(updated)
    setEditingRef(null)
  }

  const handleDeleteReference = (id: string) => {
    const { references: updated, mapping } = removeReferenceAndRenumber(references, id)
    onReferencesChange?.(updated)
    if (mapping.size > 0) onCitationNumbersChanged?.(mapping)
  }

  const handleInsertCitation = (ref: CitationReference) => {
    // The first time a source is cited it takes the next IEEE number.
    let ordinal = ref.cited
    if (ordinal == null) {
      ordinal = references.reduce((max, r) => Math.max(max, r.cited ?? 0), 0) + 1
      onReferencesChange?.(references.map((r) => (r.id === ref.id ? { ...r, cited: ordinal } : r)))
    }
    const citationText = formatInTextCitation(ref, citationStyle, { ordinal })
    // The parent inserts the text at the cursor; fall back to the editor only when no handler is given.
    if (onInsertCitation) onInsertCitation(citationText)
    else if (editor) editor.chain().focus().insertContent(citationText).run()
  }

  const handleAuthorChange = (index: number, value: string) => {
    const authors = [...(editingRef?.authors || newRef.authors)]
    authors[index] = value
    if (editingRef) {
      setEditingRef({ ...editingRef, authors })
    } else {
      setNewRef({ ...newRef, authors })
    }
  }

  const handleAddAuthor = () => {
    const authors = [...(editingRef?.authors || newRef.authors), '']
    if (editingRef) {
      setEditingRef({ ...editingRef, authors })
    } else {
      setNewRef({ ...newRef, authors })
    }
  }

  const handleRemoveAuthor = (index: number) => {
    const authors = [...(editingRef?.authors || newRef.authors)]
    authors.splice(index, 1)
    if (editingRef) {
      setEditingRef({ ...editingRef, authors })
    } else {
      setNewRef({ ...newRef, authors })
    }
  }

  /** Current reference type — used for conditional placeholder text in the form. */
  const currentRefType = editingRef?.type || newRef.type

  return (
    <div style={panelStyle}>
      {/* Tabs */}
      <div style={tabsStyle}>
        {CITATION_TABS.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...tabStyle,
              backgroundColor: activeTab === tab.id ? 'var(--primary)' : 'transparent',
              color: activeTab === tab.id ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
            }}
          >
            <span aria-hidden="true" style={{ opacity: 0.75, marginRight: '0.25rem' }}>{index + 1}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <p data-testid="citation-tab-summary" style={{ margin: '0 0 0.5rem', padding: '0 0.25rem', fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--muted-foreground)' }}>
        {CITATION_TABS.find((tab) => tab.id === activeTab)?.summary}
      </p>

      {/* Style Selector */}
      <div style={styleSelectorStyle}>
        <span style={labelStyle}>Citation Style:</span>
        <select
          value={citationStyle}
          onChange={(e) => onStyleChange?.(e.target.value as CitationStyle)}
          style={selectStyle}
        >
          {(Object.keys(CITATION_STYLE_LABELS) as CitationStyle[]).map((key) => (
            <option key={key} value={key}>{CITATION_STYLE_LABELS[key]}</option>
          ))}
        </select>
      </div>

      {activeTab === 'insert' && (
        <div style={contentStyle}>
          <input
            type="text"
            placeholder="Search references..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={searchStyle}
          />
          {sortedRefs.length === 0 ? (
            <div style={emptyStyle}>
              <Plus style={{ width: '24px', height: '24px', color: 'var(--muted-foreground)', marginBottom: '0.5rem' }} />
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                No sources to cite yet. Add them in <strong>Manage</strong> first.
              </p>
              <button type="button" onClick={() => setActiveTab('manage')} style={nextStepButtonStyle}>
                Go to Manage
              </button>
            </div>
          ) : (
            <ul style={listStyle}>
              {sortedRefs.map((ref) => {
                const RefIcon = TYPE_ICONS[ref.type]
                return (
                  <li key={ref.id} style={itemStyle}>
                    <div style={refRowStyle}>
                      <span
                        style={{
                          ...refTypeIconStyle,
                          color: ref.type === 'journal' ? 'var(--info)' : ref.type === 'book' ? 'var(--success)' : 'var(--muted-foreground)',
                        }}
                      >
                        <RefIcon style={{ width: '14px', height: '14px' }} />
                      </span>
                      <div style={refInfoStyle}>
                        <span style={refTitleStyle}>{ref.title}</span>
                        <span style={refMetaStyle}>
                          {ref.authors.slice(0, 3).map((a) => a.split(' ').pop()).join(', ')}
                          {ref.authors.length > 3 ? ' et al.' : ''} · {ref.year}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInsertCitation(ref)}
                        title="Insert citation at cursor"
                        style={insertButtonStyle}
                      >
                        <Plus style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {activeTab === 'manage' && (
        <div style={contentStyle}>
          <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              placeholder="Find by DOI, link or title…"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleLookup() }}
              style={{ ...searchStyle, marginBottom: 0, flex: 1 }}
            />
            <button type="button" onClick={() => void handleLookup()} disabled={lookupState.busy || lookupQuery.trim().length < 3} style={addButtonStyle}>
              {lookupState.busy ? <Loader2 style={{ width: '14px', height: '14px' }} className="animate-spin" /> : <Search style={{ width: '14px', height: '14px' }} />}
            </button>
          </div>
          {lookupState.message ? (
            <p style={{ fontSize: '0.75rem', color: 'var(--destructive)', margin: '-0.375rem 0 0.75rem' }}>{lookupState.message}</p>
          ) : null}
          <div style={manageHeaderStyle}>
            <h3 style={manageTitleStyle}>References ({references.length})</h3>
            <button
              type="button"
              onClick={() => {
                setEditingRef(null)
                setNewRef({ id: '', type: 'journal', authors: [''], title: '', year: new Date().getFullYear() })
                setShowAddDialog(true)
              }}
              style={addButtonStyle}
            >
              <Plus style={{ width: '14px', height: '14px', marginRight: '0.375rem' }} />
              Add Reference
            </button>
          </div>

          {(Object.entries(groupedRefs) as Array<[CitationReference['type'], CitationReference[]]>).map(([type, refs]) => {
            const TypeIcon = TYPE_ICONS[type]
            return (
              <div key={type} style={groupStyle}>
                <div style={groupLabelStyle}>
                  <TypeIcon style={{ width: '12px', height: '12px', marginRight: '0.375rem' }} />
                  {TYPE_LABELS[type]} ({refs.length})
                </div>
                <ul style={listStyle}>
                  {refs.map((ref) => (
                    <li key={ref.id} style={itemStyle}>
                      <div style={refRowStyle}>
                        <div style={refInfoStyle}>
                          <span style={refTitleStyle}>{ref.title}</span>
                          <span style={refMetaStyle}>
                            {ref.authors.slice(0, 3).map((a) => a.split(' ').pop()).join(', ')}
                            {ref.authors.length > 3 ? ' et al.' : ''} · {ref.year}
                            {ref.venue && ` · ${ref.venue}`}
                            {ref.volume && ` · vol. ${ref.volume}`}
                            {ref.pages && ` · pp. ${ref.pages}`}
                            {ref.doi && ` · doi:${ref.doi}`}
                          </span>
                        </div>
                        <div style={actionsStyle}>
                          <button
                            type="button"
                            onClick={() => setEditingRef(ref)}
                            title="Edit"
                            style={actionButtonStyle}
                          >
                            <Edit2 style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleInsertCitation(ref)}
                            title="Insert citation"
                            style={actionButtonStyle}
                          >
                            <Copy style={{ width: '14px', height: '14px' }} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteReference(ref.id)}
                            title="Delete"
                            style={{ ...actionButtonStyle, color: 'var(--destructive)' }}
                          >
                            <Trash2 style={{ width: '14px', height: '14px' }} />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          {references.length > 0 && (
            <button type="button" onClick={() => setActiveTab('insert')} style={nextStepButtonStyle}>
              Next: cite them in your text
            </button>
          )}
        </div>
      )}

      {activeTab === 'bibliography' && (
        <div style={contentStyle}>
          <div style={bibliographyHeaderStyle}>
            <h3 style={manageTitleStyle}>Bibliography</h3>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              <button
                type="button"
                disabled={bibliographyRefs.length === 0}
                onClick={() => onInsertBibliography?.(bibliographyRefs.map((ref, i) => formatBibliographyEntry(ref, citationStyle, i + 1)))}
                style={addButtonStyle}
              >
                Insert in document
              </button>
              <button
                type="button"
                disabled={bibliographyRefs.length === 0}
                onClick={() => {
                  const text = bibliographyRefs.map((ref, i) => formatBibliographyEntry(ref, citationStyle, i + 1).replace(/<[^>]+>/g, '')).join(String.fromCharCode(10, 10))
                  navigator.clipboard.writeText(text)
                }}
                style={addButtonStyle}
              >
                <Copy style={{ width: '14px', height: '14px', marginRight: '0.375rem' }} />
                Copy
              </button>
            </div>
          </div>
          {bibliographyRefs.length === 0 ? (
            <div style={emptyStyle}>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                Add your sources in Manage to generate a bibliography.
              </p>
              <button type="button" onClick={() => setActiveTab('manage')} style={nextStepButtonStyle}>
                Go to Manage
              </button>
            </div>
          ) : (
            <ol style={bibliographyListStyle}>
              {bibliographyRefs.map((ref, i) => (
                <li key={ref.id} style={bibliographyItemStyle} dangerouslySetInnerHTML={{ __html: formatBibliographyEntry(ref, citationStyle, i + 1) }} />
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      {(showAddDialog || editingRef) && (
        <div style={dialogOverlayStyle} onClick={() => { setShowAddDialog(false); setEditingRef(null) }}>
          <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
            <div style={dialogHeaderStyle}>
              <h3 style={dialogTitleStyle}>{editingRef ? 'Edit Reference' : 'Add Reference'}</h3>
              <button type="button" onClick={() => { setShowAddDialog(false); setEditingRef(null) }} style={closeButtonStyle}>
                ×
              </button>
            </div>
            <div style={dialogContentStyle}>
              <div style={formGroupStyle}>
                <label style={labelStyle}>Type</label>
                <select
                  value={editingRef?.type || newRef.type}
                  onChange={(e) => {
                    const type = e.target.value as CitationReference['type']
                    if (editingRef) setEditingRef({ ...editingRef, type })
                    else setNewRef({ ...newRef, type })
                  }}
                  style={selectStyle}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Authors</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  {(editingRef?.authors || newRef.authors).map((author, index) => (
                    <div key={index} style={authorRowStyle}>
                      <input
                        type="text"
                        placeholder={`Author ${index + 1} (Last, First)`}
                        value={author}
                        onChange={(e) => handleAuthorChange(index, e.target.value)}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                      <button type="button" onClick={() => handleRemoveAuthor(index)} style={removeAuthorButtonStyle}>
                        <Trash2 style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={handleAddAuthor} style={addAuthorButtonStyle}>
                    <Plus style={{ width: '14px', height: '14px', marginRight: '0.375rem' }} />
                    Add Author
                  </button>
                </div>
              </div>

              <div style={formGroupStyle}>
                <label style={labelStyle}>Title</label>
                <input
                  type="text"
                  placeholder="Title of work"
                  value={editingRef?.title || newRef.title}
                  onChange={(e) => {
                    if (editingRef) setEditingRef({ ...editingRef, title: e.target.value })
                    else setNewRef({ ...newRef, title: e.target.value })
                  }}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Year</label>
                  <input
                    type="number"
                    min="1000"
                    max={new Date().getFullYear() + 5}
                    value={editingRef?.year || newRef.year}
                    onChange={(e) => {
                      const year = parseInt(e.target.value) || new Date().getFullYear()
                      if (editingRef) setEditingRef({ ...editingRef, year })
                      else setNewRef({ ...newRef, year })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Venue / Publisher</label>
                  <input
                    type="text"
                    placeholder={currentRefType === 'book' ? 'Publisher' : 'Journal / Conference name'}
                    value={editingRef?.venue || newRef.venue || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, venue: e.target.value })
                      else setNewRef({ ...newRef, venue: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Volume</label>
                  <input
                    type="text"
                    placeholder="Volume"
                    value={editingRef?.volume || newRef.volume || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, volume: e.target.value })
                      else setNewRef({ ...newRef, volume: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Issue / Edition</label>
                  <input
                    type="text"
                    placeholder={currentRefType === 'book' ? 'Edition' : 'Issue'}
                    value={editingRef?.issue || newRef.issue || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, issue: e.target.value })
                      else setNewRef({ ...newRef, issue: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>Pages</label>
                  <input
                    type="text"
                    placeholder="Page range (e.g., 123-145)"
                    value={editingRef?.pages || newRef.pages || ''}
                    onChange={(e) => {
                      if (editingRef) setEditingRef({ ...editingRef, pages: e.target.value })
                      else setNewRef({ ...newRef, pages: e.target.value })
                    }}
                    style={inputStyle}
                  />
                </div>
                <div style={formGroupStyle}>
                  <label style={labelStyle}>DOI / URL</label>
                  <input
                    type="text"
                    placeholder="10.1234/example or https://..."
                    value={editingRef?.doi || newRef.doi || newRef.url || ''}
                    onChange={(e) => {
                      const value = e.target.value
                      if (editingRef) setEditingRef({ ...editingRef, doi: value.startsWith('10.') ? value : undefined, url: value.startsWith('http') ? value : undefined })
                      else setNewRef({ ...newRef, doi: value.startsWith('10.') ? value : undefined, url: value.startsWith('http') ? value : undefined })
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
            <div style={dialogFooterStyle}>
              <button type="button" onClick={() => { setShowAddDialog(false); setEditingRef(null) }} style={cancelButtonStyle}>
                Cancel
              </button>
              <button type="button" onClick={editingRef ? handleUpdateReference : handleAddReference} style={saveButtonStyle}>
                {editingRef ? 'Save Changes' : 'Add Reference'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}