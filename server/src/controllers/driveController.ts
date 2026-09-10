import { Request, Response } from 'express'
import { google } from 'googleapis'
import * as driveModel from '../models/driveModel'
import { requestDocumentConversion } from '../ai/bridge/pythonBridge'

/** Build a Google OAuth2 client from environment variables. */
function buildOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Google OAuth2 environment variables')
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

/**
 * Configure an OAuth2 client with stored tokens and persist refreshes.
 * When Google refreshes the access token (expiry), the `tokens` event fires —
 * we write the new pair back to Supabase so sessions survive token rotation.
 */
function configureOAuth2WithTokens(userId: string, tokens: { access_token: string; refresh_token: string; expiry_date: number }): InstanceType<typeof google.auth.OAuth2> {
  const oauth2 = buildOAuth2Client()
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  })

  oauth2.on('tokens', async (newTokens) => {
    if (newTokens.refresh_token || newTokens.access_token) {
      await driveModel.upsertGoogleTokens(
        userId,
        newTokens.access_token ?? tokens.access_token,
        newTokens.refresh_token ?? tokens.refresh_token,
        newTokens.expiry_date ?? 0,
      ).catch((err) => console.error('Failed to persist refreshed Google tokens:', err))
    }
  })

  return oauth2
}

/** Generate the Google OAuth2 consent URL and return it. */
export async function getAuthUrl(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id
    const oauth2 = buildOAuth2Client()
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      state: userId,
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
    const userId = (req.query.state as string | undefined) || req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
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

    // Redirect to frontend callback receiver. Fall back to the request's own
    // origin so deployments never hardcode a stale frontend host.
    const frontendUrl =
      process.env.FRONTEND_URL ||
      (req.headers.origin as string | undefined) ||
      'http://localhost:5173'
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
      fields: 'files(id, name, mimeType, modifiedTime, iconLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 60,
    })

    let files = (response.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? 'Untitled',
      mimeType: f.mimeType ?? '',
      modifiedTime: f.modifiedTime ?? '',
      iconLink: f.iconLink ?? '',
    }))

    // Some Accounts Index mismatches mimeType metadata; if the strict query came
    // back empty, fall back to any untrashed file and filter locally.
    if (files.length === 0) {
      const fallback = await drive.files.list({
        q: "trashed=false and not mimeType='application/vnd.google-apps.folder'",
        fields: 'files(id, name, mimeType, modifiedTime, iconLink)',
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
async function getDriveClient(userId: string): Promise<ReturnType<typeof google.drive>> {
  const tokens = await driveModel.getGoogleTokens(userId)
  if (!tokens) throw new Error('Google Drive not connected')
  const oauth2 = configureOAuth2WithTokens(userId, tokens)
  return google.drive({ version: 'v3', auth: oauth2 })
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
    const meta = await drive.files.get({ fileId, fields: 'name, mimeType' })
    const title = meta.data.name ?? 'Imported Document'
    const mimeType = meta.data.mimeType ?? ''

    // Native Google Docs → export as HTML (tables/images/text preserved).
    if (mimeType === 'application/vnd.google-apps.document') {
      const exported = await drive.files.export({ fileId, mimeType: 'text/html' })
      const html = typeof exported.data === 'string' ? exported.data : String(exported.data)
      res.status(200).json({ title, html })
      return
    }

    // Other file types → download the raw bytes and convert.
    const downloaded = await drive.files.get({ fileId, alt: 'media' })
    const buffer = Buffer.isBuffer(downloaded.data)
      ? downloaded.data
      : Buffer.from(downloaded.data as unknown as string)

    // Try the Python converter, then fall back to local conversion.
    let html = ''
    try {
      const pyResult = await requestDocumentConversion(buffer, title)
      if (pyResult?.html) html = pyResult.html
    } catch (pyError) {
      console.warn('Python converter unavailable for Drive file:', pyError)
    }

    if (!html && mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { convertToHtml } = await import('mammoth')
      const result = await convertToHtml({ buffer })
      html = result.value
    } else if (!html && mimeType === 'text/plain') {
      const text = buffer.toString('utf-8')
      html = text
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n')
    } else if (!html) {
      // PDF or unknown binary — fall back to the Python service result or text.
      html = buffer.toString('utf-8')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .map((line) => `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
        .join('\n')
    }

    res.status(200).json({ title, html })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}
