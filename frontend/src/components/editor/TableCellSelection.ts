import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { tableEditing, tableEditingKey } from '@tiptap/pm/tables'

/**
 * Selecting several table cells: dragging across cells, Shift+arrow out of a cell, triple-click,
 * pasting a block of cells over a cell selection, and the .selectedCell highlight.
 *
 * tiptap-table-plus replaces the table extension's plugins with its own and leaves out
 * prosemirror-tables' tableEditing, so a drag across cells only ever made a text selection and
 * cell-wide formatting, merging and splitting were out of reach. This brings back tableEditing's
 * selection state and event handlers under its own key (the commands look it up by key), but not
 * its appendTransaction: that "fixes" every table as if rows sat directly in it, and table-plus
 * wraps rows in row groups whenever a cell spans rows, which the fixer would mangle.
 */
export const TableCellSelection = Extension.create({
  name: 'tableCellSelection',

  addProseMirrorPlugins() {
    const stock = tableEditing({ allowTableNodeSelection: false })
    return [
      new Plugin({
        key: tableEditingKey,
        state: stock.spec.state,
        props: stock.spec.props,
      }),
    ]
  },
})
