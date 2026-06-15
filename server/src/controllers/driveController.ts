import { Request, Response } from 'express'
import { google } from 'googleapis'
import * as driveModel from '../models/driveModel'

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

/** Generate the Google OAuth2 consent URL and return it. */
export async function getAuthUrl(_req: Request, res: Response): Promise<void> {
  try {
    const oauth2 = buildOAuth2Client()
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
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
    const userId = req.user?.id
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

    // Redirect to frontend with a success indicator
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    res.redirect(`${frontendUrl}/dashboard?drive=connected`)
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

/** List Google Docs files from the user's Drive. */
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

    const oauth2 = buildOAuth2Client()
    oauth2.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    })

    const drive = google.drive({ version: 'v3', auth: oauth2 })
    const response = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.document' and trashed=false",
      fields: 'files(id, name, modifiedTime, iconLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 50,
    })

    const files = (response.data.files ?? []).map((f) => ({
      id: f.id ?? '',
      name: f.name ?? 'Untitled',
      modifiedTime: f.modifiedTime ?? '',
      iconLink: f.iconLink ?? '',
    }))

    res.status(200).json({ files })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

/** Export a single Google Doc as clean HTML. */
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

    const tokens = await driveModel.getGoogleTokens(userId)
    if (!tokens) {
      res.status(400).json({ error: 'Google Drive not connected' })
      return
    }

    const oauth2 = buildOAuth2Client()
    oauth2.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    })

    const drive = google.drive({ version: 'v3', auth: oauth2 })

    // Get file metadata for the title
    const meta = await drive.files.get({ fileId, fields: 'name' })
    const title = meta.data.name ?? 'Imported Document'

    // Export as HTML
    const exported = await drive.files.export({
      fileId,
      mimeType: 'text/html',
    })

    const html = typeof exported.data === 'string'
      ? exported.data
      : String(exported.data)

    res.status(200).json({ title, html })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}
