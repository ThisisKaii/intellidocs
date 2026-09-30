# Google Drive & OAuth Setup (Section 7)

Everything in this file is manual. The code paths are implemented and tested;
what cannot be automated is Google's consent screen, which needs real
credentials and a real browser.

## Why this is separate from sign-in

IntelliDocs has two distinct Google integrations, and they are deliberately not
the same thing:

| Flow | Trigger | Purpose | Token source |
|---|---|---|---|
| **Sign in** | "Continue with Google" on Login | Authenticate the user | Supabase-managed Google app |
| **Drive connect** | "Connect Google Drive" in the sidebar | Read the user's files | This project's own OAuth client |

Sign-in alone does **not** grant Drive access. Supabase's Google app is
configured with identity scopes only, so a user who signs in with Google still
needs to connect Drive separately. `AuthCallback` attempts an automatic link
when the sign-in did return a usable Drive token, and quietly skips it when it
did not. Both outcomes are correct.

## 1. Create the OAuth client

1. Open the [Google Cloud Console](https://console.cloud.google.com/) → **APIs &
   Services** → **Credentials**.
2. **Create credentials** → **OAuth client ID** → **Web application**.
3. Set the redirect URI to your Express callback. Register **both** of these on
   the OAuth client — Google compares the full string exactly:
   - `http://localhost:3000/drive/callback` (local)
   - `https://api.intellidocs-silk.vercel.app/drive/callback` (production)
4. Enable the **Google Drive API** for the same project.

Copy the client id and client secret into `server/.env`:

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/drive/callback
DRIVE_OAUTH_STATE_SECRET=<openssl rand -hex 32>
```

`DRIVE_OAUTH_STATE_SECRET` signs the OAuth `state` parameter, which is what binds
a callback to the user who started it. Generate it with
`openssl rand -hex 32`. Without it the code falls back to
`SUPABASE_SERVICE_KEY`, which works but couples two unrelated secrets.

## 2. The two ways a token is stored

Both write to the same table, `google_tokens`, which has `UNIQUE (user_id)` and
row-level security policies. **One row per user, ever.**

### a. Automatic link after Google sign-in

`AuthCallback` reads `session.provider_token` and posts it to
`POST /drive/link-provider`. This requires the sign-in to have requested offline
access, which `AuthContext.loginWithGoogle` does with `access_type=offline` and
`prompt=consent`.

This step is deliberately best-effort: it is skipped when there is no
`provider_refresh_token`, because storing an access token with no refresh token
would leave the account connected only until that token expired and then fail
with no obvious cause. It never overwrites an existing Drive connection, so a
token the user granted deliberately through the sidebar is preserved.

### b. Explicit "Connect Google Drive" button

`GET /drive/auth-url` mints a state bound to the signed-in user's id, and
`GET /drive/callback` stores the resulting token for that same id. The user
always sees the Google consent screen here.

## 3. Isolation guarantees

These are enforced in code and covered by
`server/src/routes/__tests__/driveOAuthIsolation.test.ts`:

- Every read and write of `google_tokens` is filtered by `user_id`, taken from the
  verified JWT. A `userId` in a request body is ignored.
- The OAuth `state` is HMAC-signed and expires after 10 minutes, so a callback
  cannot be replayed or pointed at another account.
- `DELETE /drive/disconnect` deletes only the caller's own row.

## 4. Manual acceptance checklist

- [ ] "Connect Google Drive" shows the Google consent screen.
- [ ] After consent, `GET /drive/status` returns `{"connected": true}`.
- [ ] User A's files are listed and only User A's.
- [ ] Sign in as User B: `GET /drive/status` returns `{"connected": false}`.
- [ ] Replaying User A's `state` value cannot connect User B.
- [ ] "Disconnect" clears the connection for that account only.
- [ ] Revoke access in the Google account's security page, then reconnect: the
      refresh-token rotation path is exercised and no 401 loop appears.
- [ ] Wait for the access token to expire (~1 hour) and confirm an API call still
      succeeds, proving the refresh listener in `driveModel` persists rotations.
