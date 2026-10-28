/**
 * Promote an existing account to administrator.
 *
 * Run from server/:  npm run make-admin -- someone@example.com
 * The account must already exist (register it through the app first).
 */
import 'dotenv/config'
import { findUserIdByEmail, promoteToAdmin } from '../src/models/userModel'

/** Look the account up by email and give it the admin role. */
async function main(): Promise<void> {
  const email = process.argv[2]?.trim()
  if (!email) throw new Error('Usage: npm run make-admin -- <email>')

  const userId = await findUserIdByEmail(email)
  if (!userId) throw new Error(`No account found for ${email}. Register it first.`)

  await promoteToAdmin(userId)
  console.log(`${email} is now an administrator.`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
