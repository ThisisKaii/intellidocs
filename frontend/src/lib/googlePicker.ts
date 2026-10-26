import type { DriveFile } from '@/services/api'

/** What the server hands over to open the picker: the caller's token and the public keys. */
export interface PickerConfig {
  accessToken: string
  apiKey: string
  appId: string
}

/** One document as Google's picker reports it. */
export interface PickedDoc {
  id: string
  name?: string
  mimeType?: string
  sizeBytes?: number
  lastEditedUtc?: number
  iconUrl?: string
}

interface PickerResponse {
  action: string
  docs?: PickedDoc[]
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder
  setOAuthToken(token: string): PickerBuilder
  setDeveloperKey(key: string): PickerBuilder
  setAppId(appId: string): PickerBuilder
  setCallback(callback: (response: PickerResponse) => void): PickerBuilder
  build(): { setVisible(visible: boolean): void }
}

interface PickerApi {
  PickerBuilder: new () => PickerBuilder
  DocsView: new (viewId?: unknown) => { setMimeTypes(types: string): unknown; setIncludeFolders(on: boolean): unknown }
  ViewId: { DOCS: unknown }
  Action: { PICKED: string; CANCEL: string }
}

interface GoogleApi {
  load(name: string, options: { callback: () => void; onerror?: () => void }): void
}

declare global {
  interface Window {
    gapi?: GoogleApi
    google?: { picker?: PickerApi }
  }
}

const SCRIPT_URL = 'https://apis.google.com/js/api.js'

/** The file types IntelliDocs can import (Google Docs, Word, PDF, text, RTF, OpenDocument). */
const IMPORTABLE_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
].join(',')

let pickerReady: Promise<PickerApi> | null = null

/** Load Google's script and its picker module once; later calls reuse the result. */
function loadPicker(): Promise<PickerApi> {
  if (pickerReady) return pickerReady
  pickerReady = new Promise<PickerApi>((resolve, reject) => {
    const fail = (): void => {
      pickerReady = null
      reject(new Error('Could not load Google\u2019s file picker. Check your connection and try again.'))
    }
    const start = (): void => {
      if (!window.gapi) return fail()
      window.gapi.load('picker', {
        callback: () => (window.google?.picker ? resolve(window.google.picker) : fail()),
        onerror: fail,
      })
    }
    if (window.gapi) return start()
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = start
    script.onerror = fail
    document.head.appendChild(script)
  })
  return pickerReady
}

/** A picked document in the shape the import flow already uses. */
export function toDriveFile(doc: PickedDoc): DriveFile {
  return {
    id: doc.id,
    name: doc.name ?? 'Untitled',
    mimeType: doc.mimeType ?? '',
    modifiedTime: doc.lastEditedUtc ? new Date(doc.lastEditedUtc).toISOString() : '',
    iconLink: doc.iconUrl ?? '',
    size: doc.sizeBytes ? String(doc.sizeBytes) : undefined,
  }
}

/**
 * Open Google's file picker and resolve with the chosen file, or null when the person
 * cancels. Picking a file is what grants the app (drive.file) access to it.
 */
export async function openDrivePicker(config: PickerConfig): Promise<DriveFile | null> {
  const picker = await loadPicker()
  return new Promise<DriveFile | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
    view.setMimeTypes(IMPORTABLE_MIME_TYPES)
    view.setIncludeFolders(true)
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(config.accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setCallback((response) => {
        if (response.action === picker.Action.PICKED && response.docs?.[0]) resolve(toDriveFile(response.docs[0]))
        else if (response.action === picker.Action.CANCEL) resolve(null)
      })
      .build()
      .setVisible(true)
  })
}
