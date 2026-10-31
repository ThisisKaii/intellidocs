import { Extension } from '@tiptap/core'
import { Node } from '@tiptap/core'

// ============================================================================
// IMAGE TEXT-WRAPPING (Phase 3: Academic Object Controls)
// ============================================================================

/** Text-wrapping modes for academic images */
type ImageWrapMode =
  | 'inline'
  | 'square'
  | 'tight'
  | 'behind'
  | 'in-front'
  | 'top-bottom'
  | 'none'

/** Image alignment within text column */
type ImageAlignment = 'left' | 'center' | 'right' | 'float' | 'inline'

/** Image node with full text-wrapping support */
const AcademicImage = Node.create({
  name: 'academicImage',
  group: 'block',
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
      wrapMode: {
        default: 'inline',
        parseHTML: (element) => element.getAttribute('data-wrap-mode') || 'inline',
        renderHTML: (attributes) => {
          const mode = attributes.wrapMode
          if (!mode || mode === 'inline') return {}
          return { 'data-wrap-mode': mode }
        },
      },
      alignment: {
        default: 'center',
        parseHTML: (element) =>
          (element.getAttribute('data-alignment') as ImageAlignment | null) ?? 'center',
        renderHTML: (attributes) => {
          const value = attributes.alignment
          if (!value || value === 'center') return {}
          return { 'data-alignment': value }
        },
      },
      caption: {
        default: null,
        parseHTML: (element) => (element.dataset.caption === 'true' ? true : null),
        renderHTML: (attributes) => (attributes.caption ? { 'data-caption': 'true' } : {}),
      },
      containerStyle: {
        default: null,
        parseHTML: (element) => element.getAttribute('containerstyle'),
        renderHTML: (attributes) => {
          const style = attributes.containerStyle
          return style ? { containerstyle: style } : {}
        },
      },
      figureNumber: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-figure-number'),
        renderHTML: (attributes) =>
          attributes.figureNumber ? { 'data-figure-number': attributes.figureNumber } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-academic-image]',
        getAttrs: (element) => ({
          src: element.getAttribute('data-src'),
          alt: element.getAttribute('data-alt'),
          title: element.getAttribute('data-title'),
          width: element.getAttribute('data-width'),
          height: element.getAttribute('data-height'),
          wrapMode: element.getAttribute('data-wrap-mode'),
          alignment: element.getAttribute('data-alignment'),
          caption: element.dataset.caption === 'true',
          containerStyle: element.getAttribute('containerstyle'),
          figureNumber: element.getAttribute('data-figure-number'),
        }),
      },
    ]
  },

renderHTML({ HTMLAttributes }) {
    const { src, alt, title, width, height, wrapMode, alignment, caption, containerStyle, figureNumber } = HTMLAttributes

    const styleParts: string[] = []
    if (width) styleParts.push(`width: ${width}px`)
    if (height) styleParts.push(`height: ${height}px`)
    if (containerStyle) styleParts.push(containerStyle)

    const wrapClass = `wrap-${wrapMode}`
    const alignClass = `align-${alignment}`

    const figureAttrs = {
      'data-academic-image': '',
      'data-src': src,
      'data-alt': alt,
      'data-title': title,
      'data-width': width,
      'data-height': height,
      'data-wrap-mode': wrapMode,
      'data-alignment': alignment,
      'data-caption': caption ? 'true' : 'false',
      'data-figure-number': figureNumber,
      class: `academic-image ${wrapClass} ${alignClass}`,
      style: styleParts.join('; ') || undefined,
    }

    let innerHTML = `<img ${Object.entries({ src, alt: alt || '', title: title || '', width: width ? `${width}px` : undefined, height: height ? `${height}px` : undefined }).map(([k, v]) => v ? `${k}="${v}"` : '').join(' ')} />`

    return ['figure', figureAttrs, innerHTML]
  },

  addCommands() {
    return {
      setImageWrapMode:
        (wrapMode: string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicImage', { wrapMode }),
      setImageAlignment:
        (alignment: string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicImage', { alignment }),
      setFigureNumber:
        (figureNumber: number | string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicImage', { figureNumber: String(figureNumber) }),
      setImageCaption:
        (caption: string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicImage', { caption }),
      removeImageCaption:
        () =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicImage', { caption: false }),
      nextFigureNumber:
        () =>
        ({ commands, editor }: { commands: any; editor: any }) => {
          const figures: number[] = []
          editor.state.doc.descendants((node: any) => {
            if (node.type.name === 'academicImage') {
              figures.push(node.attrs.figureNumber ? parseInt(node.attrs.figureNumber) : 0)
            }
          })
          const nextNum = figures.length > 0 ? Math.max(...figures) + 1 : 1
          return commands.updateAttributes('academicImage', { figureNumber: nextNum })
        },
      setImageDimensions:
        (width: number | null, height: number | null) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicImage', { width, height }),
    }
  },

  addInputRules() {
    return []
  },
})

// ============================================================================
// APA / IEEE ACADEMIC TABLES
// ============================================================================

/** Academic table style presets */
type AcademicTableStyle =
  | 'apa-three-line'
  | 'ieee-grid'
  | 'shaded-header'
  | 'borderless'
  | 'minimal'

/** Table node with academic style presets */
const AcademicTable = Node.create({
  name: 'academicTable',
  group: 'block',
  content: 'tableRow+',
  tableRole: 'table',
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      alignment: {
        default: 'center',
        parseHTML: (element) =>
          (element.getAttribute('data-alignment') as 'left' | 'center' | 'right' | null) ?? 'center',
        renderHTML: (attributes) => {
          const value = attributes.alignment
          if (!value || value === 'center') return {}
          return { 'data-alignment': value }
        },
      },
      stylePreset: {
        default: 'apa-three-line',
        parseHTML: (element) => element.getAttribute('data-style-preset') || 'apa-three-line',
        renderHTML: (attributes) => {
          const value = attributes.stylePreset
          if (!value || value === 'apa-three-line') return {}
          return { 'data-style-preset': value }
        },
      },
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-caption'),
        renderHTML: (attributes) =>
          attributes.caption ? { 'data-caption': attributes.caption } : {},
      },
      tableNumber: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-table-number'),
        renderHTML: (attributes) =>
          attributes.tableNumber ? { 'data-table-number': attributes.tableNumber } : {},
      },
      hasHeaderRow: {
        default: true,
        parseHTML: (element) => element.getAttribute('data-header-row') === 'true',
        renderHTML: (attributes) =>
          attributes.hasHeaderRow ? { 'data-header-row': 'true' } : {},
      },
      hasHeaderColumn: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-header-column') === 'true',
        renderHTML: (attributes) =>
          attributes.hasHeaderColumn ? { 'data-header-column': 'true' } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'table[data-academic-table]',
        getAttrs: (element) => ({
          alignment: element.getAttribute('data-alignment'),
          stylePreset: element.getAttribute('data-style-preset'),
          caption: element.getAttribute('data-caption'),
          tableNumber: element.getAttribute('data-table-number'),
          hasHeaderRow: element.getAttribute('data-header-row') === 'true',
          hasHeaderColumn: element.getAttribute('data-header-column') === 'true',
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { alignment, stylePreset, caption: _caption, tableNumber, hasHeaderRow, hasHeaderColumn, ...attrs } = HTMLAttributes

    const presetClass = `table-${stylePreset}`

    let innerHTML = ''

    if (_caption) {
      innerHTML += `<caption>${_caption}${tableNumber ? ` <span class="table-number">Table ${tableNumber}</span>` : ''}</caption>`
    }

    if (hasHeaderRow) {
      innerHTML += '<thead>0</thead>'
    }

    innerHTML += '<tbody>0</tbody>'

    const classes = `academic-table ${presetClass} align-${alignment} ${hasHeaderRow ? 'has-header-row' : ''} ${hasHeaderColumn ? 'has-header-column' : ''}`

    return ['table', { ...attrs, class: classes }, innerHTML]
  },

  addCommands() {
    return {
      setTableStylePreset:
        (preset: string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicTable', { stylePreset: preset }),
      setTableAlignment:
        (alignment: string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicTable', { alignment }),
      setTableCaption:
        (caption: string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicTable', { caption }),
      setTableNumber:
        (tableNumber: number | string) =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicTable', { tableNumber: String(tableNumber) }),
      toggleHeaderRow:
        () =>
        ({ commands }: { commands: any }) => {
          const table = commands.editor.state.selection.$anchor.node(-1)
          const current = table?.attrs?.hasHeaderRow ?? true
          return commands.updateAttributes('academicTable', { hasHeaderRow: !current })
        },
      toggleHeaderColumn:
        () =>
        ({ commands }: { commands: any }) => {
          const table = commands.editor.state.selection.$anchor.node(-1)
          const current = table?.attrs?.hasHeaderColumn ?? false
          return commands.updateAttributes('academicTable', { hasHeaderColumn: !current })
        },
      autoFitToPage:
        () =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicTable', { style: 'width: 100%; table-layout: fixed;' }),
      autoFitToContents:
        () =>
        ({ commands }: { commands: any }) =>
          commands.updateAttributes('academicTable', { style: 'width: auto; table-layout: auto;' }),
      setColumnWidth:
        (colIndex: number, _width: string) =>
        ({ editor }: { editor: any }) => {
          const { state } = editor
          const { $from } = state.selection
          const row = $from.node($from.depth - 1)
          const cells = row.content.content
          let updated = false
          cells.forEach((_: any, idx: number) => {
            if (idx === colIndex) {
              updated = true
            }
          })
          return updated
        },
      setCellBackground:
        (color: string) =>
        ({ commands, editor }: { commands: any; editor: any }) => {
          const { state } = editor
          const { $from } = state.selection
          const cell = $from.node($from.depth)
          if (cell && (cell.type.name === 'apaTableCell' || cell.type.name === 'apaTableHeader')) {
            return commands.updateAttributes(cell.type.name, { backgroundColor: color })
          }
          return false
        },
      setCellTextAlign:
        (align: 'left' | 'center' | 'right' | 'decimal') =>
        ({ commands, editor }: { commands: any; editor: any }) => {
          const { state } = editor
          const { $from } = state.selection
          const cell = $from.node($from.depth)
          if (cell && (cell.type.name === 'apaTableCell' || cell.type.name === 'apaTableHeader')) {
            return commands.updateAttributes(cell.type.name, { textAlign: align })
          }
          return false
        },
      setCellVerticalAlign:
        (align: 'top' | 'middle' | 'bottom') =>
        ({ commands, editor }: { commands: any; editor: any }) => {
          const { state } = editor
          const { $from } = state.selection
          const cell = $from.node($from.depth)
          if (cell && (cell.type.name === 'apaTableCell' || cell.type.name === 'apaTableHeader')) {
            return commands.updateAttributes(cell.type.name, { verticalAlign: align })
          }
          return false
        },
      mergeCells:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.mergeCells()
        },
      splitCell:
        () =>
        ({ commands }: { commands: any }) => {
          return commands.splitCell()
        },
      addRowBefore:
        () =>
        ({ commands }: { commands: any }) =>
          commands.addRowBefore(),
      addRowAfter:
        () =>
        ({ commands }: { commands: any }) =>
          commands.addRowAfter(),
      addColumnBefore:
        () =>
        ({ commands }: { commands: any }) =>
          commands.addColumnBefore(),
      addColumnAfter:
        () =>
        ({ commands }: { commands: any }) =>
          commands.addColumnAfter(),
      deleteRow:
        () =>
        ({ commands }: { commands: any }) =>
          commands.deleteRow(),
      deleteColumn:
        () =>
        ({ commands }: { commands: any }) =>
          commands.deleteColumn(),
      deleteTable:
        () =>
        ({ commands }: { commands: any }) =>
          commands.deleteTable(),
      nextTableNumber:
        () =>
        ({ commands, editor }: { commands: any; editor: any }) => {
          const tables: number[] = []
          editor.state.doc.descendants((node: any) => {
            if (node.type.name === 'academicTable') {
              tables.push(node.attrs.tableNumber ? parseInt(node.attrs.tableNumber) : 0)
            }
          })
          const nextNum = tables.length > 0 ? Math.max(...tables) + 1 : 1
          return commands.updateAttributes('academicTable', { tableNumber: nextNum })
        },
    }
  },
})

// APA Three-Line Table cell (no vertical borders)
export const APATableCell = Node.create({
  name: 'apaTableCell',
  group: 'tableCell',
  content: 'block*',
  tableRole: 'cell',

  addAttributes() {
    return {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      colspanDefault: { default: 1 },
      rowspanDefault: { default: 1 },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('bgcolor'),
        renderHTML: (attributes) => (attributes.backgroundColor ? { bgcolor: attributes.backgroundColor } : {}),
      },
      textAlign: {
        default: 'left',
        parseHTML: (element) => element.getAttribute('data-text-align') || 'left',
        renderHTML: (attributes) =>
          attributes.textAlign && attributes.textAlign !== 'left' ? { 'data-text-align': attributes.textAlign } : {},
      },
      verticalAlign: {
        default: 'top',
        parseHTML: (element) => element.getAttribute('data-vertical-align') || 'top',
        renderHTML: (attributes) =>
          attributes.verticalAlign && attributes.verticalAlign !== 'top'
            ? { 'data-vertical-align': attributes.verticalAlign }
            : {},
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => (attributes.style ? { style: attributes.style } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'td[data-apa-cell]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { backgroundColor, textAlign, verticalAlign, style, ...attrs } = HTMLAttributes
    const styleParts: string[] = []
    if (backgroundColor) styleParts.push(`background-color: ${backgroundColor}`)
    if (textAlign && textAlign !== 'left') styleParts.push(`text-align: ${textAlign}`)
    if (verticalAlign && verticalAlign !== 'top') styleParts.push(`vertical-align: ${verticalAlign}`)
    if (style) styleParts.push(style)
    return ['td', { ...attrs, 'data-apa-cell': '', class: 'apa-cell', style: styleParts.join('; ') || undefined }, 0]
  },
})

export const APATableHeader = Node.create({
  name: 'apaTableHeader',
  group: 'tableHeader',
  content: 'inline*',
  tableRole: 'headerCell',

  addAttributes() {
    return {
      colspan: { default: 1 },
      rowspan: { default: 1 },
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('bgcolor'),
        renderHTML: (attributes) => (attributes.backgroundColor ? { bgcolor: attributes.backgroundColor } : {}),
      },
      textAlign: {
        default: 'center',
        parseHTML: (element) => element.getAttribute('data-text-align') || 'center',
        renderHTML: (attributes) =>
          attributes.textAlign && attributes.textAlign !== 'center' ? { 'data-text-align': attributes.textAlign } : {},
      },
      verticalAlign: {
        default: 'middle',
        parseHTML: (element) => element.getAttribute('data-vertical-align') || 'middle',
        renderHTML: (attributes) =>
          attributes.verticalAlign && attributes.verticalAlign !== 'middle'
            ? { 'data-vertical-align': attributes.verticalAlign }
            : {},
      },
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => (attributes.style ? { style: attributes.style } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'th[data-apa-header]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { backgroundColor, textAlign, verticalAlign, style, ...attrs } = HTMLAttributes
    const styleParts: string[] = []
    if (backgroundColor) styleParts.push(`background-color: ${backgroundColor}`)
    if (textAlign && textAlign !== 'center') styleParts.push(`text-align: ${textAlign}`)
    if (verticalAlign && verticalAlign !== 'middle') styleParts.push(`vertical-align: ${verticalAlign}`)
    if (style) styleParts.push(style)
    return ['th', { ...attrs, 'data-apa-header': '', class: 'apa-header', style: styleParts.join('; ') || undefined }, 0]
  },
})

// Equations are the math nodes in MathNodes.ts (KaTeX); the old `academicEquation` node never
// rendered LaTeX, and MathNodes parses the markup it saved.

// ============================================================================
// ACADEMIC CALLOUTS (Enhanced)
// ============================================================================

/** Extended callout variants for academic writing */
type AcademicCalloutVariant =
  | 'note' | 'warning' | 'key' | 'example'
  | 'definition' | 'theorem' | 'proof' | 'remark' | 'exercise'

// ============================================================================
// ACADEMIC OBJECTS EXTENSION (Bundle)
// ============================================================================

const AcademicObjectsExtension = Extension.create({
  name: 'academicObjects',

  addOptions() {
    return {
      enableImages: true,
      enableTables: true,
      enableCallouts: true,
    }
  },

  addExtensions() {
    const extensions = []

    if (this.options.enableImages) {
      extensions.push(AcademicImage)
    }
    if (this.options.enableTables) {
      extensions.push(AcademicTable)
    }

    return extensions
  },
})

// Re-export all types and classes
export type {
  ImageWrapMode,
  ImageAlignment,
  AcademicTableStyle,
  AcademicCalloutVariant,
}
export {
  AcademicImage,
  AcademicTable,
  AcademicObjectsExtension,
}