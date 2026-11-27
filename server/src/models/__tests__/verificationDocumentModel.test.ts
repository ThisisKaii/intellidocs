import {
  detectVerificationDocumentType,
  saveVerificationDocument,
  signVerificationDocumentUrls,
  VerificationDocumentError,
} from '../verificationDocumentModel'

const uploadMock = jest.fn()
const createBucketMock = jest.fn()
const createSignedUrlsMock = jest.fn()

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      createBucket: (...args: unknown[]) => createBucketMock(...args),
      from: jest.fn(() => ({
        upload: (...args: unknown[]) => uploadMock(...args),
        createSignedUrls: (...args: unknown[]) => createSignedUrlsMock(...args),
      })),
    },
  })),
}))

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const PDF_BYTES = Buffer.from('%PDF-1.4\n', 'ascii')

describe('verificationDocumentModel', () => {
  beforeEach(() => {
    uploadMock.mockReset()
    createBucketMock.mockReset()
    createSignedUrlsMock.mockReset()
  })

  it('detects PNG and PDF magic bytes and rejects plain text', () => {
    expect(detectVerificationDocumentType(PNG_BYTES)).toEqual({ mime: 'image/png', extension: 'png' })
    expect(detectVerificationDocumentType(PDF_BYTES)).toEqual({ mime: 'application/pdf', extension: 'pdf' })
    expect(detectVerificationDocumentType(Buffer.from('not an image'))).toBeNull()
  })

  it('rejects unsupported file bytes before touching storage', async () => {
    await expect(
      saveVerificationDocument('u1', 'professor', {
        buffer: Buffer.from('plain text masquerading as png'),
        mimetype: 'image/png',
        originalname: 'fake.png',
      }),
    ).rejects.toThrow(VerificationDocumentError)

    expect(uploadMock).not.toHaveBeenCalled()
  })

  it('uploads valid faculty ID images under userId/professor and returns metadata', async () => {
    uploadMock.mockResolvedValue({ error: null })

    const stored = await saveVerificationDocument('u1', 'professor', {
      buffer: PNG_BYTES,
      mimetype: 'image/png',
      originalname: '../id-card.png',
    })

    expect(stored.mime).toBe('image/png')
    expect(stored.name).toBe('id-card.png')
    expect(stored.path).toMatch(/^u1\/professor\/.+\.png$/)
    expect(uploadMock).toHaveBeenCalledWith(stored.path, PNG_BYTES, { contentType: 'image/png', upsert: false })
  })

  it('signs stored paths for admin review', async () => {
    createSignedUrlsMock.mockResolvedValue({
      data: [{ path: 'u1/professor/id.png', signedUrl: 'https://signed.example/id.png' }],
      error: null,
    })

    const map = await signVerificationDocumentUrls(['u1/professor/id.png', 'u1/professor/id.png'])

    expect(createSignedUrlsMock).toHaveBeenCalledWith(['u1/professor/id.png'], 3600)
    expect(map.get('u1/professor/id.png')).toBe('https://signed.example/id.png')
  })
})
