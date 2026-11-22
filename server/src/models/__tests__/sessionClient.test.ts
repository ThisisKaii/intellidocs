/**
 * Signing someone up or in must never happen on the shared service-role client: supabase-js keeps
 * the session and would send that user's token on every later query of the shared client.
 */
const clients: Array<{ auth: { signUp: jest.Mock; signInWithPassword: jest.Mock } }> = []

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const client = {
      auth: {
        signUp: jest.fn(async () => ({ data: { user: { id: 'new' } }, error: null })),
        signInWithPassword: jest.fn(async () => ({ data: { user: { id: 'u' }, session: {} }, error: null })),
        admin: { getUserById: jest.fn() },
      },
      from: jest.fn(),
      rpc: jest.fn(),
    }
    clients.push(client)
    return client
  }),
}))

import { registerUser, signInWithPassword } from '../userModel'

it('signs up and signs in on fresh clients, never on the shared one', async () => {
  const shared = clients[0]
  await registerUser('a@example.test', 'Password-123', 'Ada', 'Lane')
  await registerUser('b@example.test', 'Password-123', 'Ben', 'Lane')
  await signInWithPassword('a@example.test', 'Password-123')

  expect(shared.auth.signUp).not.toHaveBeenCalled()
  expect(shared.auth.signInWithPassword).not.toHaveBeenCalled()
  const used = clients.filter((client) => client.auth.signUp.mock.calls.length + client.auth.signInWithPassword.mock.calls.length > 0)
  expect(used).toHaveLength(3)
})
