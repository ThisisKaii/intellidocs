import type { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { createWriteStream } from 'fs'
import { stat } from 'fs/promises'

/** Report download progress as a percentage of the declared size. */
export type ProgressReporter = (percent: number) => void

/** A download stream plus the optional headers googleapis attaches to it. */
export type DownloadStream = Readable & { headers?: Record<string, string | string[] | undefined> }

/**
 * Stream a Drive download to disk while reporting progress.
 *
 * The declared size comes from `content-length` when googleapis supplies it.
 * When it is absent the download still completes, just without a percentage:
 * reporting a fabricated number would be worse than reporting none.
 */
export async function streamToFileWithProgress(
  source: DownloadStream,
  destinationPath: string,
  onProgress?: ProgressReporter
): Promise<{ bytes: number; size: number }> {
  let bytes = 0
  const rawLength = source.headers?.['content-length']
  const declared = Number(Array.isArray(rawLength) ? rawLength[0] : rawLength ?? 0)
  let lastReported = -1

  source.on('data', (chunk: Buffer | string) => {
    bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk)
    if (!onProgress || declared <= 0) return
    // Only report on whole-percent changes; a 50MB file would otherwise emit
    // thousands of updates and thrash Redis.
    const percent = Math.min(99, Math.floor((bytes / declared) * 100))
    if (percent !== lastReported) {
      lastReported = percent
      onProgress(percent)
    }
  })

  await pipeline(source, createWriteStream(destinationPath))

  // Trust the bytes on disk over the declared length.
  const { size } = await stat(destinationPath)
  return { bytes, size }
}
