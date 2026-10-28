import { buildMemoryClient } from '../redisClient'
import { allowAttempt } from '../attemptLimit'

let clock = 1_000_000
const memory = buildMemoryClient(() => clock)

jest.mock('../redisClient', () => {
  const actual = jest.requireActual('../redisClient')
  return { ...actual, getRedisClient: jest.fn(async () => memory) }
})

describe('allowAttempt', () => {
  it('allows the first attempts and refuses the ones over the limit', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 5; i += 1) results.push(await allowAttempt('join:user-a', 3, 600))
    expect(results).toEqual([true, true, true, false, false])
  })

  it('counts each key on its own', async () => {
    for (let i = 0; i < 4; i += 1) await allowAttempt('join:user-b', 3, 600)
    expect(await allowAttempt('join:user-c', 3, 600)).toBe(true)
  })

  it('starts counting again once the window has passed', async () => {
    for (let i = 0; i < 4; i += 1) await allowAttempt('join:user-d', 3, 600)
    expect(await allowAttempt('join:user-d', 3, 600)).toBe(false)
    clock += 601_000
    expect(await allowAttempt('join:user-d', 3, 600)).toBe(true)
  })
})
