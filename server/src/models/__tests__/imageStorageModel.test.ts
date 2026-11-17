/** Where pictures are stored (Supabase bucket or Cloudflare R2) and how they are recorded and removed. */

const calls: Array<Record<string, unknown>> = []

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    storage: {
      from: jest.fn((bucket: string) => ({
        upload: jest.fn(async (path: string) => {
          calls.push({ op: 'supabase-upload', bucket, path })
          return { error: null }
        }),
        getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` } })),
        remove: jest.fn(async (paths: string[]) => {
          calls.push({ op: 'supabase-remove', paths })
          return { error: null }
        }),
        list: jest.fn(async () => ({ data: [] })),
      })),
    },
    from: jest.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      let op: Record<string, unknown> = { table }
      builder.insert = (row: unknown) => {
        op = { ...op, op: 'insert', row }
        return builder
      }
      builder.update = (row: unknown) => {
        op = { ...op, op: 'update', row }
        return builder
      }
      builder.delete = () => {
        op = { ...op, op: 'delete' }
        return builder
      }
      builder.select = () => {
        op = { ...op, op: 'select' }
        return builder
      }
      builder.eq = (column: string, value: unknown) => {
        op = { ...op, [column]: value }
        return builder
      }
      builder.in = (column: string, values: unknown[]) => {
        op = { ...op, [column]: values }
        return builder
      }
      builder.then = (resolve: (value: unknown) => unknown) => {
        calls.push(op)
        const data = op.op === 'select' ? [{ path: 'u1/a.png', backend: 'supabase' }, { path: 'u1/b.jpg', backend: 'r2' }] : null
        return resolve({ data, error: null })
      }
      return builder
    }),
  })),
}))

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(async (command: { kind: string; input: unknown }) => {
      calls.push({ op: `r2-${command.kind}`, input: command.input })
      return {}
    }),
  })),
  PutObjectCommand: jest.fn().mockImplementation((input: unknown) => ({ kind: 'put', input })),
  DeleteObjectsCommand: jest.fn().mockImplementation((input: unknown) => ({ kind: 'delete', input })),
}))

import { linkImagesToDocument, locateImage, removeDocumentImages, removeImages, storeImage } from '../imageStorageModel'

const R2_ENV = {
  R2_ACCOUNT_ID: 'acct',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_PUBLIC_URL: 'https://pics.example.com/',
}

function withR2(on: boolean): void {
  for (const [name, value] of Object.entries(R2_ENV)) {
    if (on) process.env[name] = value
    else delete process.env[name]
  }
}

beforeEach(() => {
  calls.length = 0
  withR2(false)
})

describe('storing a picture', () => {
  it('uses the Supabase bucket when R2 is not configured, and records the picture', async () => {
    const url = await storeImage('u1', { buffer: Buffer.from('abcd'), mimetype: 'image/jpeg' }, 'doc-1')
    expect(url).toMatch(/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/public\/document-images\/u1\/[0-9a-f-]+\.jpg$/)
    expect(calls[0]).toMatchObject({ op: 'supabase-upload', bucket: 'document-images' })
    expect(calls[1]).toMatchObject({ table: 'stored_images', op: 'insert', row: { user_id: 'u1', document_id: 'doc-1', bytes: 4, backend: 'supabase' } })
  })

  it('uses Cloudflare R2 when it is configured, served from its public URL', async () => {
    withR2(true)
    const url = await storeImage('u1', { buffer: Buffer.from('abcdef'), mimetype: 'image/png' })
    expect(url).toMatch(/^https:\/\/pics\.example\.com\/u1\/[0-9a-f-]+\.png$/)
    expect(calls[0]).toMatchObject({ op: 'r2-put', input: { Bucket: 'document-images', ContentType: 'image/png' } })
    expect(calls[1]).toMatchObject({ table: 'stored_images', op: 'insert', row: { bytes: 6, backend: 'r2', document_id: null } })
  })
})

describe('finding and removing pictures', () => {
  it('tells each URL where its picture lives', () => {
    withR2(true)
    expect(locateImage('https://pics.example.com/u1/x.png')).toEqual({ path: 'u1/x.png', backend: 'r2' })
    expect(locateImage('https://proj.supabase.co/storage/v1/object/public/document-images/u1/y.png?t=1')).toEqual({ path: 'u1/y.png', backend: 'supabase' })
    expect(locateImage('https://elsewhere.org/z.png')).toBeNull()
  })

  it('removes pictures from wherever they are, and their records', async () => {
    withR2(true)
    await removeImages(['https://pics.example.com/u1/x.png', 'https://proj.supabase.co/storage/v1/object/public/document-images/u1/y.png'])
    expect(calls).toContainEqual({ op: 'supabase-remove', paths: ['u1/y.png'] })
    expect(calls).toContainEqual(expect.objectContaining({ op: 'r2-delete', input: expect.objectContaining({ Delete: { Objects: [{ Key: 'u1/x.png' }], Quiet: true } }) }))
    expect(calls).toContainEqual(expect.objectContaining({ table: 'stored_images', op: 'delete', path: ['u1/x.png', 'u1/y.png'] }))
  })

  it('removes the pictures tied to a document before it is deleted for good', async () => {
    withR2(true)
    await removeDocumentImages('doc-1')
    expect(calls[0]).toMatchObject({ table: 'stored_images', op: 'select', document_id: 'doc-1' })
    expect(calls).toContainEqual({ op: 'supabase-remove', paths: ['u1/a.png'] })
    expect(calls).toContainEqual(expect.objectContaining({ op: 'r2-delete' }))
  })

  it('ties the pictures a new document shows to it, and only those', async () => {
    await linkImagesToDocument('u1', 'doc-1', [
      '<img src="https://proj.supabase.co/storage/v1/object/public/document-images/u1/a.png"><img src="https://elsewhere.org/z.png">',
      JSON.stringify({ src: 'https://proj.supabase.co/storage/v1/object/public/document-images/u1/b.jpg' }),
    ])
    expect(calls).toEqual([
      { table: 'stored_images', op: 'update', row: { document_id: 'doc-1' }, user_id: 'u1', path: ['u1/a.png', 'u1/b.jpg'] },
    ])
  })
})
