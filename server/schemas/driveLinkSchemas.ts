import { z } from 'zod'

/**
 * Body for linking a Google provider token to the signed-in account.
 *
 * The token arrives from the Supabase session after a Google OAuth login. It is
 * stored against the *authenticated* user id from the JWT — never a user id
 * supplied in the body — so a token can only ever be attached to the account
 * that presented it.
 */
export const linkGoogleDriveSchema = z.object({
  /** OAuth provider access token, as returned by Supabase in the session. */
  providerToken: z.string().trim().min(10, 'providerToken is required'),
  /**
   * Refresh token for the provider. Optional because Supabase only returns it
   * on the first consent; later logins omit it, and the stored one is kept.
   */
  providerRefreshToken: z.string().trim().optional(),
  /** Absolute expiry in epoch milliseconds; 0 means "unknown". */
  expiresAt: z.number().int().min(0).default(0),
})

export type LinkGoogleDriveInput = z.infer<typeof linkGoogleDriveSchema>

/**
 * Query for the Drive consent URL. `loginHint` is the Google account already linked to this
 * IntelliDocs account, so Google opens on that account instead of an account chooser. It is
 * only a hint to Google: the tokens are still stored against the signed-in user.
 */
export const driveAuthUrlQuerySchema = z.object({
  loginHint: z.string().trim().email('loginHint must be an email address').max(254).optional(),
})
