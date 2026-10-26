import { Extension } from '@tiptap/core'

/**
 * Character spacing on a run of text (Word's "condensed by 0.45pt"). Imported text carries
 * it, and without it a tightly set line wraps a word earlier than in Word.
 */
export const LetterSpacingExtension = Extension.create({
  name: 'letterSpacing',

  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element) => element.style.letterSpacing || null,
            renderHTML: (attributes) => (attributes.letterSpacing ? { style: `letter-spacing: ${attributes.letterSpacing}` } : {}),
          },
        },
      },
    ]
  },
})
