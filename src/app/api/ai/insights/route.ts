import { aiResponse, readAiJson, userDatabase } from "@/lib/ai/server"
import { insightRequestSchema } from "@/lib/ai/insight-contract"
import { enqueueInsight, insightRevision, readInsightStatus, requireInsightsEnabled, withInsightQueue } from "@/lib/ai/insight-queue"
import { FinanceError } from "@/lib/finance-errors"

export async function POST(request: Request) {
  return aiResponse(request, async ({ userId }) => {
    requireInsightsEnabled()
    const input = insightRequestSchema.parse(await readAiJson(request))
    const revision = await userDatabase(userId, (connection) => insightRevision(connection, userId))
    const status = await withInsightQueue(async (queue) => {
      const job = await enqueueInsight(queue, userId, input, revision)
      return readInsightStatus(job, userId, revision, queue)
    })
    return Response.json(status)
  })
}

export async function GET(request: Request) {
  return aiResponse(request, async ({ userId }) => {
    requireInsightsEnabled()
    const jobId = new URL(request.url).searchParams.get("jobId")
    if (!jobId || !/^[a-f0-9]{64}$/.test(jobId)) throw new FinanceError("invalidInput")
    const status = await withInsightQueue(async (queue) => {
      const job = await queue.getJob(jobId)
      if (!job || job.data.userId !== userId) throw new FinanceError("recordMissing", 404)
      const revision = await userDatabase(userId, (connection) => insightRevision(connection, userId))
      return readInsightStatus(job, userId, revision, queue)
    })
    return Response.json(status)
  })
}
