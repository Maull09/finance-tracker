import { Worker } from "bullmq"
import { getInsightQueue, insightConnection, insightQueueName } from "../src/lib/ai/insight-queue"
import { ollamaEnabled, redisEnabled } from "../src/lib/server/service-config"

async function main() {
  if (!redisEnabled() || !ollamaEnabled()) {
    console.log("Insight worker disabled by REDIS_ENABLED or OLLAMA_ENABLED")
    return
  }
  const { processPageInsight } = await import("../src/lib/ai/page-insights")
  const queue = getInsightQueue()
  await queue.setGlobalConcurrency(1)
  const producer = await queue.getBackend().client
  const connection = insightConnection(true)
  const worker = new Worker(insightQueueName, processPageInsight, {
    connection, concurrency: 1,
  })
  worker.on("error", () => console.error("Insight worker connection unavailable"))
  worker.on("failed", () => console.warn("Insight job failed; retry or check worker configuration"))
  const cleanup = setInterval(() => {
    void Promise.all([queue.clean(86400_000, 500, "completed"), queue.clean(3600_000, 500, "failed")])
      .catch(() => console.warn("Insight queue cleanup unavailable"))
  }, 60_000)
  let stopping = false
  async function stop() {
    if (stopping) return
    stopping = true
    clearInterval(cleanup)
    await worker.close()
    await queue.close()
    producer.disconnect()
    connection.disconnect()
    process.exit(0)
  }
  process.on("SIGINT", () => void stop())
  process.on("SIGTERM", () => void stop())
  await worker.waitUntilReady()
  console.log("Insight worker ready (global concurrency: 1)")
}

main().catch(() => {
  console.error("Insight worker failed to start; check queue, database and model configuration")
  process.exit(1)
})
