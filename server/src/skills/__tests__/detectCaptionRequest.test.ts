import { detectCaptionRequest } from '../detectCaptionRequest'

describe('detectCaptionRequest', () => {
  it.each([
    ['Auto caption', ['figure', 'table']],
    ['auto-caption everything', ['figure', 'table']],
    ['caption all the figures', ['figure']],
    ['Caption every table', ['table']],
    ['add captions to the pictures and tables', ['figure', 'table']],
    ['Can you add captions to all my images?', ['figure']],
    ['insert the missing captions', ['figure', 'table']],
  ])('%s', (message, kinds) => {
    expect(detectCaptionRequest(message)).toEqual({ kinds })
  })

  it.each([
    'make all captions italic',
    'center the figure captions',
    'add a caption',
    'what is a caption?',
    'fix the caption numbers',
  ])('is not a request to caption everything: %s', (message) => {
    expect(detectCaptionRequest(message)).toBeNull()
  })
})
