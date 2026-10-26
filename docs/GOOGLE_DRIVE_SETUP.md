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
needs to connect Drive separately, from the import dialog.

## 0. Scope and the file picker

Drive import uses the non-sensitive `drive.file` scope, so Google shows no
"unverified app" screen and imposes no user cap. The app cannot browse a Drive;
the person chooses a file in Google's own **file picker** (opened from
`DriveImportDialog` with a token from `GET /drive/picker-config`), and the app can
read exactly that file. One-time Cloud setup:

1. **APIs & Services** → enable **Google Picker API** (keep the Drive API on).
2. **Credentials** → **Create credentials** → **API key**. Restrict it to the Google
   Picker API and to HTTP referrers (your Vercel site and `http://localhost:5173/*`).
3. Copy the **project number** from the Cloud console home page.
4. Set `GOOGLE_PICKER_API_KEY` and `GOOGLE_APP_ID` (the project number) on the server
   (Render env and local `server/.env`).
5. **Google Auth Platform → Data access**: remove `drive.readonly`, add `drive.file`.

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

### a. No automatic link at sign-in

Sign-in asks for identity scopes only (`openid email profile`), so signing in with
Google never shows Google's "unverified app" warning. `AuthCallback` no longer
posts a provider token to `POST /drive/link-provider` (the route remains, unused).

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
