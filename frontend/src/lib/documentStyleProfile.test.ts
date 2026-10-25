import { describe, expect, it } from 'vitest'
import { Schema } from '@tiptap/pm/model'
import { buildStyleProfile, documentStyleOverrides, isEstablished } from './documentStyleProfile'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*', attrs: { textAlign: { default: 'left' } } },
  },
})

const centered = (value: string) => schema.node('paragraph', { textAlign: 'center' }, [schema.text(value)])
const left = (value: string) => schema.node('paragraph', null, [schema.text(value)])

describe('document style profile', () => {
  const doc = schema.node('doc', null, [
    left('A STUDY OF SOMETHING'),
    centered('1. Introduction'),
    centered('2. Methods'),
    centered('3. Results'),
    left('Body text goes here and runs on.'),
  ])

  it('learns the style most blocks of a role share', () => {
    const profile = buildStyleProfile(doc)
    const chapter = profile.heading_1
    expect(isEstablished(chapter)).toBe(true)
    expect(chapter?.style.textAlign).toBe('center')
    expect(chapter?.share).toBe(1)
  })

  it('keeps a suggestion quiet for a block that already matches its own document', () => {
    const profile = buildStyleProfile(doc)
    const matching = doc.child(0).nodeSize + 1
    expect(documentStyleOverrides(profile, doc, matching, { textAlign: 'center' })).toBe(true)
  })

  it('does not decide anything for a role the document barely uses', () => {
    const profile = buildStyleProfile(doc)
    expect(isEstablished(profile.heading_2)).toBe(false)
  })
})
