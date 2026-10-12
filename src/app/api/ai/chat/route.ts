import { claimConversation, readConversation, releaseConversation, saveReply } from "@/lib/ai/conversations"
import { runChat } from "@/lib/ai/graph"
import { aiResponse, readAiJson } from "@/lib/ai/server"
import { chatSchema } from "@/lib/ai/validation"
import { requireOllamaEnabled } from "@/lib/server/service-config"

export const runtime = "nodejs"
export const maxDuration = 180

export async function POST(request: Request) {
  return aiResponse(request, async ({ userId }) => {
    requireOllamaEnabled()
    const input = chatSchema.parse(await readAiJson(request))
    const claim = await claimConversation(userId, input.conversationId, input.message)
    try {
      const history = [...claim.history]
      if (claim.draftContext.length) history.splice(history.length - 1, 0, {
        role: "assistant", content: "Existing draft statuses (recorded by the application): " + JSON.stringify(claim.draftContext),
      })
      const reply = await runChat(userId, history, input.locale)
      await saveReply(userId, input.conversationId, reply.text, reply.drafts)
      return Response.json(await readConversation(userId, input.conversationId))
    } finally {
      await releaseConversation(userId, input.conversationId, claim.busyUntil)
    }
  })
}
