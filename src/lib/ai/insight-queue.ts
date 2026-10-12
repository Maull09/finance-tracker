import { createHash } from "node:crypto"
import { Queue, type Job } from "bullmq"
import IORedis from "ioredis"
import { sql } from "drizzle-orm"
import { getToday } from "@/lib/finance"
import { FinanceError } from "@/lib/finance-errors"
import type { UserDatabase } from "@/lib/server/authenticated-response"
import { redisEnabled, requireOllamaEnabled } from "@/lib/server/service-config"
import { canonicalInsightContext, type InsightContext, type InsightRequest, type InsightResult, type InsightStatus } from "./insight-contract"

export const insightQueueName = "finance-page-insights-v1"
export const insightCacheMs = 15 * 60_000
export const insightQueueWaitMs = 5 * 60_000
export type InsightJobData = { userId: string; context: InsightContext; locale: "id" | "en"; revision: string; requestedAt: number }
export type InsightJob = Job<InsightJobData, InsightResult | null>
export type InsightQueue = Queue<InsightJobData, InsightResult | null>
let queue: InsightQueue | undefined

export function requireInsightsEnabled() {
  requireOllamaEnabled()
  if (!redisEnabled()) throw new FinanceError("aiDisabled", 503)
}

export function insightConnection(worker = false) {
  requireInsightsEnabled()
  const url = process.env.INSIGHTS_REDIS_URL
  if (!url || !["redis:", "rediss:"].includes(new URL(url).protocol)) throw new FinanceError("aiNotConfigured", 503)
  return new IORedis(url, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: worker ? null : 1,
    enableOfflineQueue: worker, ...(worker ? {} : { commandTimeout: 3000 }) })
}

export function getInsightQueue() {
  requireInsightsEnabled()
  if (!queue) {
    queue = new Queue<InsightJobData, InsightResult | null>(insightQueueName, {
      connection: insightConnection(), defaultJobOptions: {
        attempts: 2, backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400, count: 500 }, removeOnFail: { age: 3600, count: 500 },
      },
    })
    queue.on("error", () => console.warn("Insight queue connection unavailable"))
  }
  return queue
}

export async function insightRevision(connection: Pick<UserDatabase, "execute">, userId: string) {
  const { rows } = await connection.execute<{ scope: string; revision: string }>(sql`
    select scope, revision from api_cache_revisions where scope in (${userId}, 'market') order by scope`)
  return createHash("sha256").update(JSON.stringify([getToday(), rows])).digest("hex")
}

export function insightJobId(userId: string, context: InsightContext, locale: string, revision: string, now = Date.now()) {
  return createHash("sha256").update(JSON.stringify(["concise-v2", userId, canonicalInsightContext(context), locale, revision, Math.floor(now / insightCacheMs)])).digest("hex")
}

async function admitInsight(target: InsightQueue, userId: string) {
  if (await target.getWaitingCount() >= 500) throw new FinanceError("aiBusy", 429)
  const client = await target.getBackend().client
  client.defineCommand("admitPageInsight", { numberOfKeys: 1, lua: `
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
    return count` })
  const count = await client.runCommand("admitPageInsight", [`finance:insight-rate:${userId}`])
  if (Number(count) > 20) throw new FinanceError("aiRateLimited", 429)
}

export async function enqueueInsight(target: InsightQueue, userId: string, request: InsightRequest, revision: string) {
  const context = canonicalInsightContext(request.context)
  const jobId = insightJobId(userId, context, request.locale, revision)
  const existing = await target.getJob(jobId)
  if (existing) {
    const state = await existing.getState()
    if (request.refresh && state === "waiting" && Date.now() - existing.data.requestedAt > insightQueueWaitMs) {
      await admitInsight(target, userId)
      await existing.updateData({ ...existing.data, requestedAt: Date.now() })
    }
    if (request.refresh && ["completed", "failed"].includes(state)) {
      await admitInsight(target, userId)
      await existing.updateData({ ...existing.data, requestedAt: Date.now() })
      try {
        await existing.retry(state as "completed" | "failed", { resetAttemptsMade: true })
      } catch (error) {
        if (["completed", "failed", "unknown"].includes(await existing.getState())) throw error
      }
    }
    return existing
  }
  await admitInsight(target, userId)
  return target.add("explain-page", { userId, context, locale: request.locale, revision, requestedAt: Date.now() }, { jobId })
}

export async function readInsightStatus(job: InsightJob, userId: string, revision: string, target: InsightQueue): Promise<InsightStatus> {
  if (job.data.userId !== userId) throw new FinanceError("recordMissing", 404)
  const jobId = job.id!
  if (job.data.revision !== revision) return { jobId, status: "stale" }
  const state = await job.getState()
  if (state === "completed") {
    const completed = await target.getJob(jobId)
    if (!completed?.returnvalue) return { jobId, status: "stale" }
    return { jobId, status: "completed", result: completed.returnvalue }
  }
  if (state === "failed" || state === "unknown" || (state !== "active" && Date.now() - job.data.requestedAt > insightQueueWaitMs)) return { jobId, status: "failed" }
  return { jobId, status: state === "active" ? "active" : "waiting" }
}

export async function withInsightQueue<T>(action: (queue: InsightQueue) => Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const target = getInsightQueue()
    await Promise.race([
      target.waitUntilReady(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new FinanceError("aiUnavailable", 503)), 3000)
      }),
    ])
    clearTimeout(timer)
    return await action(target)
  } catch (error) {
    if (error instanceof FinanceError) throw error
    throw new FinanceError("aiUnavailable", 503)
  } finally {
    clearTimeout(timer)
  }
}
