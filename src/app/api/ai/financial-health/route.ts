import { z } from "zod"
import { healthInputSchema } from "@/lib/financial-health"
import { explainFinancialHealth } from "@/lib/ai/financial-health"
import { claimConversation, releaseConversation, saveReply } from "@/lib/ai/conversations"
import { aiResponse, readAiJson, userDatabase } from "@/lib/ai/server"
import { readFinancialHealth } from "@/lib/server/financial-health-queries"
import { requireOllamaEnabled } from "@/lib/server/service-config"

export const runtime = "nodejs"
export const maxDuration = 180

const inputSchema = healthInputSchema.extend({ locale: z.enum(["en", "id"]) }).strict()

export async function POST(request: Request) {
  return aiResponse(request, async ({ userId }) => {
    requireOllamaEnabled()
    const { locale, ...input } = inputSchema.parse(await readAiJson(request))
    const report = await userDatabase(userId, (connection) => readFinancialHealth(connection, input))
    const prompt = `${locale === "id" ? "Jelaskan kesehatan finansial saya untuk" : "Explain my financial health for"} ${input.month}`
    const claim = await claimConversation(userId, null, prompt)
    try {
      const insight = await explainFinancialHealth(report, locale)
      await saveReply(userId, claim.conversationId, insight, [])
      return Response.json({ report, insight, conversationId: claim.conversationId })
    } finally {
      await releaseConversation(userId, claim.conversationId, claim.busyUntil)
    }
  })
}
