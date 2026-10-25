import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { describeBlock, isFormatSatisfied, isTitleCandidate } from './formatSatisfied'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    heading: { group: 'block', content: 'inline*', attrs: { level: { default: 1 }, docRole: { default: null } } },
    orderedList: { group: 'block', content: 'listItem+' },
    bulletList: { group: 'block', content: 'listItem+' },
    listItem: { content: 'paragraph' },
  },
})

const text = (value: string) => schema.text(value)

describe('isFormatSatisfied', () => {
  it('knows a numbered list item is already a numbered list', () => {
    const doc = schema.node('doc', null, [
      schema.node('orderedList', null, [schema.node('listItem', null, [schema.node('paragraph', null, [text('one')])])]),
    ])
    const block = describeBlock(doc, 4)
    expect(isFormatSatisfied(block, 'orderedList')).toBe(true)
    expect(isFormatSatisfied(block, 'ordered_list')).toBe(true)
    expect(isFormatSatisfied(block, 'bulletList')).toBe(false)
  })

  it('matches heading level and title role', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, [text('INTRODUCTION')]),
      schema.node('heading', { level: 1, docRole: 'title' }, [text('MY TITLE')]),
    ])
    expect(isFormatSatisfied(describeBlock(doc, 1), 'heading1')).toBe(true)
    expect(isFormatSatisfied(describeBlock(doc, 1), 'heading2')).toBe(false)
    const title = describeBlock(doc, doc.child(0).nodeSize + 1)
    expect(isFormatSatisfied(title, 'title')).toBe(true)
    expect(isFormatSatisfied(title, 'heading1')).toBe(false)
  })

  it('keeps a plain paragraph suggestible', () => {
    const doc = schema.node('doc', null, [schema.node('paragraph', null, [text('hello')])])
    expect(isFormatSatisfied(describeBlock(doc, 1), 'heading1')).toBe(false)
    expect(isFormatSatisfied(describeBlock(doc, 1), 'paragraph')).toBe(true)
  })
})

describe('isTitleCandidate', () => {
  it('accepts an early line and rejects an ALL-CAPS line after a heading', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [text('A STUDY OF THINGS')]),
      schema.node('heading', { level: 1 }, [text('INTRODUCTION')]),
      schema.node('paragraph', null, [text('SCOPE OF THE STUDY')]),
    ])
    expect(isTitleCandidate(doc, 1)).toBe(true)
    const late = doc.child(0).nodeSize + doc.child(1).nodeSize + 1
    expect(isTitleCandidate(doc, late)).toBe(false)
  })
})
