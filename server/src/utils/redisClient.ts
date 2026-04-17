import { createClient, type RedisClientType } from 'redis'

let client: RedisClientType | null = null

export async function getRedisClient(): Promise<RedisClientType> {
  if (client && client.isOpen) {
    return client
  }

  const url = process.env.REDIS_URL || 'redis://localhost:6379'
    console.log('Redis URL:', url)
  client = createClient({ url })

  client.on('error', (err) => {
    console.error('Redis client error:', err)
  })

  if (!client.isOpen) {
    await client.connect()
  }

  return client
}
