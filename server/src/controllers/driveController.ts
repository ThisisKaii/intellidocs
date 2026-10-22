import { Request, Response } from 'express'
import { OAuth2Client } from 'googleapis-common'
import type { drive_v3 } from 'googleapis/build/src/apis/drive'
import crypto from 'crypto'
import os from 'os'
import path from 'path'
import { Readable } from 'stream'
import { rm, readFile, stat } from 'fs/promises'
import * as driveModel from '../models/driveModel'
import { getImportJob, isStaleJob, listUserImportJobs } from '../models/importJobModel'
import { requestDocumentConversion, requestDocumentConversionFromPath, parseDocument } from '../ai/bridge/pythonBridge'
import { enqueueImportJob, LARGE_FILE_BYTES } from '../skills/processImportJob'
import { sanitizeImportedHtml } from '../skills/sanitizeImportedHtml'
import { streamToFileWithProgress, type DownloadStream } from '../skills/streamDownload'
import { rtfToParagraphs, textToHtml } from '../skills/driveTextExtract'
import type { LinkGoogleDriveInput } from '../../schemas/driveLinkSchemas'

/** Build a Google OAuth2 client from environment variables. */
function buildOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth2 environment variables')
  }

  return new OAuth2Client(clientId, clientSecret, redirectUri)
}

/** OAuth state values expire after 10 minutes. */
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

/**
 * Files above this size are handed to the async import queue instead of being
 * converted inside the request. Re-exported from the job skill so the threshold
 * has exactly one definition across the codebase.
 */

/** Secret used to sign OAuth state values (dedicated env var, service-key fallback). */
function oauthStateSecret(): string {
  const secret = process.env.DRIVE_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_KEY
  if (!secret) {
    throw new Error('Missing DRIVE_OAUTH_STATE_SECRET or SUPABASE_SERVICE_KEY for OAuth state signing')
  }
  return secret
}

/** Mint a signed, user-bound OAuth state value. */
function signOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now()}`
  const signature = crypto.createHmac('sha256', oauthStateSecret()).update(payload).digest('hex')
  return Buffer.from(`${payload}.${signature}`, 'utf-8').toString('base64url')
}

/**
 * Verify a signed OAuth state and return the user id it was minted for.
 * Returns null when the state is forged, malformed, or older than 10 minutes —
 * the callback must never trust an unsigned user id from the query string.
 *
 * `secretOverride` exists only for the test that proves a state signed with one
 * secret is rejected under another; production always uses the configured secret.
 */
function verifyOAuthState(state: string, secretOverride?: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf-8')
    const parts = decoded.split('.')
    if (parts.length !== 3) return null
    const [userId, issuedAt, signature] = parts
    if (!userId || !issuedAt || !signature) return null
    const secret = secretOverride ?? oauthStateSecret()
    const expected = crypto.createHmac('sha256', secret).update(`${userId}.${issuedAt}`).digest('hex')
    const providedBuf = Buffer.from(signature, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) return null
    const issued = Number(issuedAt)
    if (!Number.isFinite(issued) || Date.now() - issued > OAUTH_STATE_TTL_MS) return null
    return userId
  } catch {
    return null
  }
}

// Test-only accessors for the Section 7 isolation suite. They exercise the exact
// signing/verification code the callback uses, without exporting it as API.
export const __testing = {
  signOAuthState,
  verifyOAuthState,
  issueAt: (userId: string, issuedAt: number): string => {
    const payload = `${userId}.${issuedAt}`
    const signature = crypto.createHmac('sha256', oauthStateSecret()).update(payload).digest('hex')
    return Buffer.from(`${payload}.${signature}`, 'utf-8').toString('base64url')
  },
}

/** Generate the Google OAuth2 consent URL and return it. */
export async function getAuthUrl(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const oauth2 = buildOAuth2Client()
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: signOAuthState(userId),
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
      ],
    })
    res.status(200).json({ url })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/** Handle the OAuth2 callback, exchange code for tokens, and store them. */
export async function handleCallback(req: Request, res: Response): Promise<void> {
  try {
    // Redirect to frontend callback receiver. Fall back to the request's own
    // origin so deployments never hardcode a stale frontend host.
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (req.headers.origin as string | undefined) ||
      'http://localhost:5173'

    // Google reports user-facing failures (denied consent, etc.) on the query.
    const oauthError = typeof req.query.error === 'string' ? req.query.error : undefined
    if (oauthError) {
      res.redirect(`${frontendUrl}/drive-callback?drive=error&error=${encodeURIComponent(oauthError)}`)
      return
    }

    // The state is signed by this server and bound to one user id. Never trust
    // an unsigned state value: that would let a forged callback bind an
    // attacker's Google tokens to an arbitrary IntelliDocs account.
    const rawState = typeof req.query.state === 'string' ? req.query.state : ''
    const userId = rawState ? verifyOAuthState(rawState) : null
    if (!userId) {
      res.status(400).json({ error: 'Invalid or expired OAuth state. Please start the connection again.' })
      return
    }

    const code = req.query.code as string | undefined
    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' })
      return
    }

    const oauth2 = buildOAuth2Client()
    const { tokens } = await oauth2.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      res.status(400).json({ error: 'Failed to obtain tokens from Google' })
      return
    }

    await driveModel.upsertGoogleTokens(
      userId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expiry_date ?? 0,
    )

    res.redirect(`${frontendUrl}/drive-callback?drive=connected`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/** Check whether the user has connected Google Drive. */
export async function getConnectionStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const tokens = await driveModel.getGoogleTokens(userId)
    res.status(200).json({ connected: tokens !== null })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/** Disconnect Google Drive by deleting stored tokens. */
export async function disconnect(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    await driveModel.deleteGoogleTokens(userId)
    res.status(200).json({ message: 'Google Drive disconnected' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/**
 * Link a Google provider token from a Google sign-in session to this account.
 *
 * The user id comes from the verified JWT, never from the request body, so a
 * token can only ever be stored against the account that presented it. A token
 * that is already present is left untouched, so this never overwrites a
 * deliberate Drive consent grant.
 */
export async function linkProviderToken(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const { providerToken, providerRefreshToken, expiresAt } =
      req.body as LinkGoogleDriveInput

    // Supabase omits the provider refresh token on every sign-in after the first,
    // because Google will not reissue one. Refuse rather than store an empty
    // refresh token, which would leave an account connected until it expired.
    if (!providerRefreshToken) {
      res.status(400).json({
        error: 'Google did not return a refresh token. Use "Connect Google Drive" to grant access.',
      })
      return
    }

    const result = await driveModel.linkProviderTokenIfAbsent(
      userId,
      providerToken,
      providerRefreshToken,
      expiresAt
    )

    res.status(200).json({ connected: true, linked: result.linked, message: result.reason })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/** List importable files from the user's Drive (native docs + office/plain text). */
export async function listFiles(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const tokens = await driveModel.getGoogleTokens(userId)
    if (!tokens) {
      res.status(400).json({ error: 'Google Drive not connected' })
      return
    }

    const drive = await getDriveClient(userId)
    const q =
      "trashed=false and " +
      "(mimeType='application/vnd.google-apps.document' or " +
      "mimeType='application/vnd.google-apps.kix-signed' or " +
      "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or " +
      "mimeType='application/pdf' or " +
      "mimeType='text/plain' or " +
      "mimeType='application/rtf' or " +
      "mimeType='application/vnd.oasis.opendocument.text' or " +
      "name contains '.doc' or name contains '.docx' or " +
      "name contains '.pdf' or name contains '.txt' or " +
      "name contains '.rtf' or name contains '.odt')"

    const response = await drive.files.list({
      q,
      fields: 'files(id, name, mimeType, modifiedTime, iconLink, size)',
      orderBy: 'modifiedTime desc',
      pageSize: 60,
    })

    let files = (response.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? 'Untitled',
      mimeType: f.mimeType ?? '',
      modifiedTime: f.modifiedTime ?? '',
      iconLink: f.iconLink ?? '',
      size: f.size ?? '',
    }))

    // Some Accounts Index mismatches mimeType metadata; if the strict query came
    // back empty, fall back to any untrashed file and filter locally.
    if (files.length === 0) {
      const fallback = await drive.files.list({
        q: "trashed=false and not mimeType='application/vnd.google-apps.folder'",
        fields: 'files(id, name, mimeType, modifiedTime, iconLink, size)',
        orderBy: 'modifiedTime desc',
        pageSize: 100,
      })
      files = (fallback.data.files ?? [])
        .map((f) => ({
          id: f.id ?? '',
          name: f.name ?? 'Untitled',
          mimeType: f.mimeType ?? '',
          modifiedTime: f.modifiedTime ?? '',
          iconLink: f.iconLink ?? '',
          size: f.size ?? '',
        }))
        .filter(isImportable)
    }

    res.status(200).json({ files })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/** Resolve the user's OAuth2 client with stored tokens, refreshing if expired. */
async function getDriveClient(userId: string): Promise<drive_v3.Drive> {
  return driveModel.getDriveClient(userId)
}

/** Whether a Drive file can be imported into IntelliDocs (native docs, office, plain text). */
function isImportable(file: { name: string; mimeType: string }): boolean {
  const importableMimes = new Set([
    'application/vnd.google-apps.document',
    'application/vnd.google-apps.kix-signed',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'text/plain',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
  ])
  if (importableMimes.has(file.mimeType)) return true
  return /\.(docx?|pdf|txt|rtf|odt)$/i.test(file.name)
}

/** Convert a googleapis download payload (stream/Blob/Buffer/string/ArrayBuffer) into a Buffer. */
async function toBuffer(data: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof Blob) return Buffer.from(await data.arrayBuffer())
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (typeof data === 'string') return Buffer.from(data)
  if (Array.isArray(data)) return Buffer.from(data as number[])
  // googleapis `alt: 'media'` downloads arrive as a passthrough Readable stream.
  if (data instanceof Readable || (data && typeof (data as { pipe?: unknown }).pipe === 'function')) {
    const chunks: Buffer[] = []
    for await (const chunk of (data as Readable)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }
  throw new Error('Unsupported data type returned by Google Drive')
}

/**
 * Export a Drive file into IntelliDocs HTML content.
 * - Native Google Docs → text/html export.
 * - Office / plain-text / PDF files → download bytes and convert server-side,
 *   reusing the Python conversion bridge with a Mammoth fallback for .docx.
 */
export async function exportFile(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const fileId = req.params.fileId
    if (!fileId) {
      res.status(400).json({ error: 'File ID is required' })
      return
    }

    const drive = await getDriveClient(userId)

    // Get file metadata for type + title
    const meta = await drive.files.get({ fileId, fields: 'name, mimeType, size' })
    const title = meta.data.name ?? 'Imported Document'
    const mimeType = meta.data.mimeType ?? ''

    // Native Google Docs → export as HTML (tables/images/text preserved).
    if (mimeType === 'application/vnd.google-apps.document') {
      const exported = await drive.files.export(
        { fileId, mimeType: 'text/html' },
        { responseType: 'arraybuffer' },
      )
      const html = (await toBuffer(exported.data)).toString('utf-8')
      res.status(200).json({ title, html: sanitizeImportedHtml(html) })
      return
    }

    // A file Drive already reports as oversized goes to the async queue: the
    // download plus conversion would otherwise hold this request open long
    // enough for the proxy or client to time out. The client polls
    // /imports/:jobId for progress instead.
    const declaredSize = Number(meta.data.size ?? 0)
    if (declaredSize > LARGE_FILE_BYTES) {
      const job = await enqueueImportJob(userId, fileId, title)
      res.status(202).json({
        jobId: job.id,
        state: job.state,
        fileName: title,
        size: declaredSize,
      })
      return
    }

    // Other file types → stream the download to a temp file so a large document
    // never has to sit in the V8 heap as one giant buffer.
    const tempPath = path.join(os.tmpdir(), `intellidocs-drive-${crypto.randomUUID()}`)
    try {
      // `responseType: 'stream'` keeps the raw bytes intact and lets the file
      // land on disk chunk by chunk instead of arriving as a decoded string.
      const downloaded = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'stream' },
      )
      await streamToFileWithProgress(downloaded.data as DownloadStream, tempPath)

      const { size } = await stat(tempPath)
      // Small files convert straight from memory; large ones stay on disk and
      // are streamed to the converter instead of being read in full.
      const buffer = size <= LARGE_FILE_BYTES ? await readFile(tempPath) : null
      const readBuffered = (): Promise<Buffer> => (buffer ? Promise.resolve(buffer) : readFile(tempPath))

      // The Python endpoint dispatches on the file name extension, so rebuild a
      // name that matches the declared MIME type when Drive omits the extension.
      const lowerTitle = title.toLowerCase()
      const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      let conversionFilename = title
      if (mimeType === docxMime && !lowerTitle.endsWith('.docx')) {
        conversionFilename = `${title}.docx`
      } else if (mimeType === 'application/pdf' && !lowerTitle.endsWith('.pdf')) {
        conversionFilename = `${title}.pdf`
      }

      let html = ''
      let converterError: string | null = null
      try {
        const pyResult = buffer
          ? await requestDocumentConversion(buffer, conversionFilename)
          : await requestDocumentConversionFromPath(tempPath, conversionFilename)
        if (pyResult?.html) html = pyResult.html
      } catch (pyError) {
        converterError = pyError instanceof Error ? pyError.message : String(pyError)
        console.warn('Python converter unavailable for Drive file:', pyError)
      }

      if (!html && (mimeType === docxMime || /\.docx$/i.test(title))) {
        const { convertToHtml } = await import('mammoth')
        const result = buffer
          ? await convertToHtml({ buffer })
          : await convertToHtml({ path: tempPath })
        html = result.value
      } else if (!html && (mimeType === 'application/msword' || /\.doc$/i.test(title))) {
        throw new Error(
          'Legacy .doc format is not supported. Please open the file in Microsoft Word or Google Docs and save it as .docx, then import again.',
        )
      } else if (!html && mimeType === 'application/rtf') {
        // RTF cannot be recovered from raw bytes locally; emit a readable message.
        html = rtfToParagraphs(await readBuffered())
      } else if (!html && mimeType === 'text/plain') {
        html = textToHtml((await readBuffered()).toString('utf-8'))
      } else if (!html && /\.pdf$/i.test(title)) {
        // The legacy converter may not handle complex layouts; try the
        // marker/opendataloader parse pipeline before refusing the file.
        try {
          const parsed = await parseDocument({ buffer: await readBuffered(), filename: conversionFilename, mimetype: mimeType })
          if (parsed?.html) html = parsed.html
        } catch (parseError) {
          const parseMsg = parseError instanceof Error ? parseError.message : String(parseError)
          throw new Error(
            converterError
              ? `Document conversion service unavailable (${converterError}; parse: ${parseMsg}).`
              : `This PDF could not be converted (${parseMsg}).`
          )
        }
      } else if (!html) {
        html = textToHtml((await readBuffered()).toString('utf-8'))
      }

      res.status(200).json({ title, html: sanitizeImportedHtml(html) })
    } finally {
      await rm(tempPath, { force: true }).catch(() => undefined)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/**
 * Return the state of an async import. The job is scoped to the requesting
 * user, so another user's job id returns 404 rather than leaking its content.
 */
export async function getImportStatus(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const jobId = req.params.jobId
    const job = jobId ? await getImportJob(jobId) : null
    if (!job || job.userId !== userId) {
      res.status(404).json({ error: 'Import job not found' })
      return
    }

    // A worker that died mid-import leaves the job stuck forever. Report it as
    // failed so the client stops polling instead of spinning until the browser
    // gives up.
    if (isStaleJob(job)) {
      res.status(200).json({
        ...job,
        state: 'failed',
        progress: 0,
        error:
          'The import did not finish. The server may have restarted during processing. Please try again.',
      })
      return
    }

    res.status(200).json(job)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/**
 * List a user's recent import jobs, newest first. Lets a reconnecting client
 * re-attach to a job it started before a page reload.
 */
export async function listImports(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    const jobs = await listUserImportJobs(userId)
    // A terminal job's HTML is dropped from the list response; the client
    // fetches it from the status route when it actually needs the content.
    res.status(200).json({ jobs: jobs.map((job) => ({ ...job, html: '' })) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}
