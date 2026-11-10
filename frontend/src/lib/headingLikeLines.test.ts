import { describe, expect, it } from 'vitest'
import { headingLikeLines } from './headingLikeLines'

describe('headingLikeLines', () => {
  it('lists bold section titles and skips body text, captions, table cells and bold sentences', () => {
    const html = [
      '<p><strong>Statement of the Problem</strong></p>',
      '<p>Body text that is not bold at all and runs on.</p>',
      '<p><strong>Figure 1: Conceptual Framework</strong></p>',
      '<table><tbody><tr><td><p><strong>Term</strong></p></td></tr></tbody></table>',
      '<p><strong>This whole sentence is bold because the writer wanted emphasis here.</strong></p>',
      '<p><strong>Conceptual Framework.</strong></p>',
      '<p><strong>Mixed</strong> emphasis line</p>',
    ].join('')
    expect(headingLikeLines(html)).toEqual(['Statement of the Problem', 'Conceptual Framework.'])
  })
})
