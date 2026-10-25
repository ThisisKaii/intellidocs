/** How the pages are laid out, in px measured from the top of the page stack. */
export interface PageGrid {
  /** Distance from the top of one page to the top of the next (page height plus the gap). */
  pitch: number
  pageHeight: number
  marginTop: number
  marginBottom: number
}

/** A text block as measured on screen. */
export interface FlowBlock {
  kind: 'paragraph' | 'heading'
  /** Top of each line box, in order. */
  lineTops: number[]
  lineHeight: number
}

/** A push that keeps a block (or the tail of one) off an awkward page position. */
export interface FlowPush {
  block: number
  /** Index of the line the push goes in front of (0 = the whole block). */
  line: number
  /** Height of the spacer that moves that line to the top of the next page. */
  height: number
  reason: 'orphan' | 'widow' | 'keep-with-next'
}

/** Page index (0-based) a vertical position falls on. */
function pageOf(grid: PageGrid, y: number): number {
  return Math.max(0, Math.floor(y / grid.pitch))
}

/** Top of the text area of a page. */
function bodyTop(grid: PageGrid, page: number): number {
  return page * grid.pitch + grid.marginTop
}

/** Page each line of a block is on, judged by the middle of the line. */
function linePages(grid: PageGrid, block: FlowBlock): number[] {
  return block.lineTops.map((top) => pageOf(grid, top + block.lineHeight / 2))
}

/**
 * Word's pagination rules that the paginator does not know: a paragraph never
 * leaves one line alone at the bottom of a page (orphan) or at the top of the
 * next (widow), and a heading never ends a page with its text on the next.
 * Returns the spacers that fix them; apply them, re-measure and call again,
 * because a push can create a new violation further down.
 */
export function decidePushes(grid: PageGrid, blocks: FlowBlock[]): FlowPush[] {
  const pushes: FlowPush[] = []
  blocks.forEach((block, index) => {
    const lines = block.lineTops.length
    if (lines === 0) return
    const pages = linePages(grid, block)
    const first = pages[0]
    const atPageTop = block.lineTops[0] - bodyTop(grid, first) < block.lineHeight * 1.5

    if (block.kind === 'heading') {
      const next = blocks[index + 1]
      if (next && next.lineTops.length > 0 && !atPageTop) {
        const nextPage = pageOf(grid, next.lineTops[0] + next.lineHeight / 2)
        if (nextPage > pages[lines - 1]) {
          pushes.push({ block: index, line: 0, height: bodyTop(grid, first + 1) - block.lineTops[0], reason: 'keep-with-next' })
        }
      }
      return
    }

    if (lines < 2) return
    const onFirstPage = pages.filter((page) => page === first).length
    if (onFirstPage === 1 && pages[1] > first && !atPageTop) {
      pushes.push({ block: index, line: 0, height: bodyTop(grid, first + 1) - block.lineTops[0], reason: 'orphan' })
      return
    }
    const last = pages[lines - 1]
    const onLastPage = pages.filter((page) => page === last).length
    if (lines >= 3 && onLastPage === 1 && pages[lines - 2] < last) {
      pushes.push({ block: index, line: lines - 2, height: bodyTop(grid, last) - block.lineTops[lines - 2], reason: 'widow' })
    }
  })
  return pushes.filter((push) => push.height > 1 && push.height < grid.pageHeight)
}
