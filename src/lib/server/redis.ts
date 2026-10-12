import { createClient } from "@redis/client"
import { redisEnabled } from "./service-config"

type RedisClient = ReturnType<typeof createClient>

let client: RedisClient | undefined
let connecting: Promise<RedisClient> | undefined

export async function getRedisClient() {
  if (!redisEnabled()) return null
  const url = process.env.REDIS_URL
  if (!url) return null

  if (!client) {
    client = createClient({
      url,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
      disableOfflineQueue: true,
    })
    client.on("error", () => console.warn("Redis cache connection unavailable"))
  }
  if (client.isReady) return client
  if (!connecting) {
    const currentClient = client
    connecting = currentClient.connect()
      .then(() => currentClient)
      .finally(() => { connecting = undefined })
  }
  return connecting
}
