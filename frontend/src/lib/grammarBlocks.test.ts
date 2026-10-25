import { describe, expect, it } from 'vitest'
import {
  buildGrammarBlocks,
  textToGrammarBlocks,
  type GrammarDocLike,
  type GrammarNodeLike,
} from './grammarBlocks'

/** Build a fake text block node. */
function textblock(name: string, text: string, textAlign?: string): GrammarNodeLike {
  return { isTextblock: true, textContent: text, type: { name }, attrs: textAlign ? { textAlign } : {} }
}

/** Build a fake document that visits the given (node, parent) pairs in order. */
function fakeDoc(entries: [GrammarNodeLike, GrammarNodeLike | null][]): GrammarDocLike {
  return {
    descendants: (callback) => {
      entries.forEach(([node, parent], index) => {
        callback(node, index, parent)
      })
    },
  }
}

describe('buildGrammarBlocks', () => {
  it('carries kind, alignment and centring per block', () => {
    const listItem: GrammarNodeLike = { isTextblock: false, textContent: '', type: { name: 'listItem' }, attrs: {} }
    const blocks = buildGrammarBlocks(
      fakeDoc([
        [textblock('paragraph', 'A Proposal Project', 'center'), null],
        [textblock('heading', 'Introduction'), null],
        [textblock('paragraph', 'collect data'), listItem],
        [textblock('paragraph', 'Body text here.', 'left'), null],
      ])
    )
    expect(blocks).toEqual([
      { text: 'A Proposal Project', kind: 'paragraph', align: 'center', centered: true },
      { text: 'Introduction', kind: 'heading', align: 'left', centered: false },
      { text: 'collect data', kind: 'listItem', align: 'left', centered: false },
      { text: 'Body text here.', kind: 'paragraph', align: 'left', centered: false },
    ])
  })

  it('skips empty blocks and collapses inner whitespace', () => {
    const blocks = buildGrammarBlocks(
      fakeDoc([
        [textblock('paragraph', '   '), null],
        [textblock('paragraph', 'two   words\tnow'), null],
      ])
    )
    expect(blocks.map((block) => block.text)).toEqual(['two words now'])
  })

  it('stops at the payload cap', () => {
    const big = 'a'.repeat(30000)
    const blocks = buildGrammarBlocks(
      fakeDoc([
        [textblock('paragraph', big), null],
        [textblock('paragraph', big), null],
        [textblock('paragraph', big), null],
      ])
    )
    expect(blocks).toHaveLength(2)
  })
})

describe('textToGrammarBlocks', () => {
  it('splits HTML block tags and newlines into separate blocks', () => {
    const blocks = textToGrammarBlocks('<p>First line</p><p>Second  line</p>\nThird')
    expect(blocks.map((block) => block.text)).toEqual(['First line', 'Second line', 'Third'])
  })
})
