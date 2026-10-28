import { detectImageType } from '../imageType'

describe('detectImageType', () => {
  it('recognises PNG, JPEG and WebP by their first bytes', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ')])
    expect(detectImageType(png)).toEqual({ mime: 'image/png', extension: 'png' })
    expect(detectImageType(jpeg)).toEqual({ mime: 'image/jpeg', extension: 'jpg' })
    expect(detectImageType(webp)).toEqual({ mime: 'image/webp', extension: 'webp' })
  })

  it('rejects other files even when they are named like pictures', () => {
    expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(detectImageType(Buffer.from('GIF89a......'))).toBeNull()
    expect(detectImageType(Buffer.from('RIFF....WAVEfmt '))).toBeNull()
    expect(detectImageType(Buffer.alloc(0))).toBeNull()
  })
})
