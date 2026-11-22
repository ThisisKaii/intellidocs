/**
 * An import that cannot finish says so early: a full account is refused before converting, and a
 * conversion that runs out of time is reported, not handed to the slow fallback converter.
 */
import { AxiosError } from 'axios'

const requestDocumentConversion = jest.fn()
const assertWithinStorageQuota = jest.fn()
const createTabbedDocument = jest.fn()
const discard = jest.fn(async () => undefined)

jest.mock('../../ai/bridge/pythonBridge', () => {
  const actual = jest.requireActual('../../ai/bridge/pythonBridge')
  return { ...actual, requestDocumentConversion: (...args: unknown[]) => requestDocumentConversion(...args) }
})
jest.mock('../../models/userModel', () => ({ assertWithinStorageQuota: (...args: unknown[]) => assertWithinStorageQuota(...args) }))
jest.mock('../../models/documentModel', () => ({ linkDocumentImages: jest.fn() }))
jest.mock('../../models/documentTabModel', () => ({ createTabbedDocument: (...args: unknown[]) => createTabbedDocument(...args) }))
jest.mock('../uploadImportImages', () => ({ uploadImportImages: jest.fn(async (_: string, html: string) => html) }))
jest.mock('../resolveConvertedImages', () => ({ importImageStore: () => ({ store: jest.fn(), discard }), resolveConvertedImages: jest.fn() }))
jest.mock('../buildImportedLayout', () => ({ buildImportedLayout: jest.fn() }))
jest.mock('../prepareImportedContent', () => ({ prepareImportedContent: jest.fn() }))

import { conversionTimeoutMs, isConversionTimeout } from '../../ai/bridge/pythonBridge'
import { importLocalFile } from '../importLocalFile'

const docx = { buffer: Buffer.from('PK fake docx'), originalname: 'Thesis.docx' }

beforeEach(() => {
  jest.clearAllMocks()
  assertWithinStorageQuota.mockResolvedValue(undefined)
})

it('refuses an import for a full account before converting anything', async () => {
  assertWithinStorageQuota.mockRejectedValue(Object.assign(new Error('Storage full.'), { status: 413, code: 'storage_quota_exceeded' }))
  await expect(importLocalFile('u1', docx)).rejects.toMatchObject({ code: 'storage_quota_exceeded' })
  expect(requestDocumentConversion).not.toHaveBeenCalled()
})

it('reports a conversion that ran out of time instead of falling back to the slow converter', async () => {
  requestDocumentConversion.mockRejectedValue(new AxiosError('timeout of 180000ms exceeded', 'ECONNABORTED'))
  await expect(importLocalFile('u1', docx)).rejects.toThrow('took too long')
  expect(createTabbedDocument).not.toHaveBeenCalled()
  expect(discard).toHaveBeenCalled()
})

it('gives larger files more time to convert', () => {
  expect(conversionTimeoutMs(5_000_000)).toBe(195_000)
  expect(conversionTimeoutMs(192_000_000)).toBe(180_000 + 192 * 3_000)
})

it('recognises a timed-out conversion and nothing else', () => {
  expect(isConversionTimeout(new AxiosError('timeout of 180000ms exceeded', 'ECONNABORTED'))).toBe(true)
  expect(isConversionTimeout(new AxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE'))).toBe(false)
  expect(isConversionTimeout(new Error('timeout of 1ms exceeded'))).toBe(false)
})
