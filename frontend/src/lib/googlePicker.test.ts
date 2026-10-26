import { describe, expect, it } from 'vitest'
import { toDriveFile } from './googlePicker'

describe('toDriveFile', () => {
  it('maps a picked document to the import flow\u2019s file shape', () => {
    const file = toDriveFile({
      id: 'abc',
      name: 'Thesis.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 2048,
      lastEditedUtc: Date.UTC(2026, 9, 1),
      iconUrl: 'https://example.com/icon.png',
    })
    expect(file).toEqual({
      id: 'abc',
      name: 'Thesis.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      modifiedTime: '2026-10-01T00:00:00.000Z',
      iconLink: 'https://example.com/icon.png',
      size: '2048',
    })
  })

  it('leaves the size out for a native Google Doc, which has none', () => {
    const file = toDriveFile({ id: 'doc', name: 'Notes', mimeType: 'application/vnd.google-apps.document' })
    expect(file.size).toBeUndefined()
    expect(file.modifiedTime).toBe('')
  })
})
