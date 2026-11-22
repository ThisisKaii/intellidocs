import { getActiveDocumentId } from '@/lib/activeDocument'
import { api } from '@/services/api'

/**
 * Picture slots ("drop-in slots"): an image a template or preset places where a figure belongs,
 * tagged `data-placeholder-slot="true"` with an optional `data-slot-label`. Selecting one offers
 * Replace / Paste / Remove (ImageOptionsToolbar); filling it swaps only the picture, so its caption,
 * alignment and width stay, and clears the tag so it becomes an ordinary picture.
 */

/** Escape text for SVG markup. */
function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char)
}

/** The drawing a new slot shows until a picture is put in it: a dashed frame with its label. */
export function slotPlaceholderSrc(label: string): string {
  const text = escapeXml(label.trim() || 'Figure')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450">` +
    `<rect x="4" y="4" width="792" height="442" rx="12" fill="#f5f6f8" stroke="#9aa3af" stroke-width="4" stroke-dasharray="16 12"/>` +
    `<text x="400" y="205" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" fill="#4b5563">${text}</text>` +
    `<text x="400" y="255" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" fill="#6b7280">Select, then Replace or Paste a picture</text>` +
    `</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** A file as a data URL (the fallback when the upload fails, as for any inserted picture). */
function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Image read failed'))
    reader.readAsDataURL(file)
  })
}

/** The picture types the editor stores (the same list the file dialogs offer). */
export const PICTURE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

/** A picture the app refused (not a picture, storage full): its message is for the user. */
export class PictureRefusedError extends Error {}

/**
 * Store a picture for the open document and return where it is. A file that is not a picture,
 * or an upload the server refuses (storage full, unsupported type), is refused with a message;
 * only an upload that could not be sent (offline, server failure) falls back to embedding the
 * picture, so it is never lost.
 */
export async function storePicture(file: File): Promise<string> {
  if (!PICTURE_TYPES.includes(file.type)) {
    throw new PictureRefusedError('That file is not a picture. Choose a PNG, JPEG, GIF, WebP or SVG image.')
  }
  try {
    return await api.documents.uploadImage(file, getActiveDocumentId())
  } catch (error) {
    const status = (error as { status?: number }).status
    if (typeof status === 'number' && status >= 400 && status < 500) {
      throw new PictureRefusedError(error instanceof Error && error.message ? error.message : 'The picture could not be added.')
    }
    return readAsDataUrl(file)
  }
}

/** Store a picture for a slot and return where it is (see storePicture). */
export async function storeSlotPicture(file: File): Promise<string> {
  return storePicture(file)
}

/** Ask the person for a picture file; resolves null when they cancel. */
export function pickPictureFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = PICTURE_TYPES.join(',')
    input.onchange = () => resolve(input.files?.[0] ?? null)
    // A dialog closed without a choice fires no change event; window focus comes back instead.
    window.addEventListener('focus', () => window.setTimeout(() => resolve(input.files?.[0] ?? null), 400), { once: true })
    input.click()
  })
}

/** The first picture on the clipboard, as a file; null when there is none or reading is refused. */
export async function clipboardPicture(): Promise<File | null> {
  if (!navigator.clipboard?.read) return null
  const items = await navigator.clipboard.read()
  for (const item of items) {
    const type = item.types.find((candidate) => candidate.startsWith('image/'))
    if (!type) continue
    const blob = await item.getType(type)
    return new File([blob], `pasted.${type.split('/')[1] ?? 'png'}`, { type })
  }
  return null
}
