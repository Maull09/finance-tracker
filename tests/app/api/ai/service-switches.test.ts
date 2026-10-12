import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), upload: vi.fn(), transaction: vi.fn(), execute: vi.fn(),
  claim: vi.fn(), read: vi.fn(), save: vi.fn(), release: vi.fn(),
  chat: vi.fn(), receipt: vi.fn(), health: vi.fn(), explain: vi.fn(),
  select: vi.fn(), from: vi.fn(), orderBy: vi.fn(), limit: vi.fn(),
}))
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getUser: mocks.getUser }, storage: { from: () => ({ upload: mocks.upload }) },
}) }))
vi.mock("@/lib/ai/conversations", () => ({
  claimConversation: mocks.claim, readConversation: mocks.read,
  saveReply: mocks.save, releaseConversation: mocks.release,
}))
vi.mock("@/lib/ai/graph", () => ({ runChat: mocks.chat, runReceipt: mocks.receipt }))
vi.mock("@/lib/server/financial-health-queries", () => ({ readFinancialHealth: mocks.health }))
vi.mock("@/lib/ai/financial-health", () => ({ explainFinancialHealth: mocks.explain }))
import { POST as chat } from "@/app/api/ai/chat/route"
import { POST as receipt } from "@/app/api/ai/receipts/route"
import { POST as health } from "@/app/api/ai/financial-health/route"
import { GET as history } from "@/app/api/ai/conversations/route"

const conversationId = "00000000-0000-4000-8000-000000000001"
const request = (path: string, body: unknown = {}, origin?: string) => new Request("http://localhost/api/ai/" + path, {
  method: "POST", headers: { host: "localhost", "content-type": "application/json", ...(origin ? { origin } : {}) },
  body: JSON.stringify(body),
})

describe("AI generation switches", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("OLLAMA_ENABLED", "false")
    mocks.getUser.mockResolvedValue({ data: { user: { id: "alice" } }, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it.each([["chat", chat], ["receipts", receipt], ["financial-health", health]] as const)(
    "blocks %s before saving messages, uploading receipts, reading records or inference", async (path, handler) => {
      const response = await handler(request(path))
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ code: "aiDisabled" })
      expect(response.headers.get("cache-control")).toBe("private, no-store")
      expect(mocks.claim).not.toHaveBeenCalled()
      expect(mocks.upload).not.toHaveBeenCalled()
      expect(mocks.transaction).not.toHaveBeenCalled()
      expect(mocks.chat).not.toHaveBeenCalled()
      expect(mocks.receipt).not.toHaveBeenCalled()
      expect(mocks.health).not.toHaveBeenCalled()
      expect(mocks.save).not.toHaveBeenCalled()
    },
  )

  it("still checks identity and origin before returning a disabled response", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await chat(request("chat"))).status).toBe(401)
    expect((await chat(request("chat", {}, "https://foreign.test"))).status).toBe(403)
    expect(mocks.claim).not.toHaveBeenCalled()
  })

  it("allows configured chat after enabling Ollama even when Redis is disabled", async () => {
    vi.stubEnv("OLLAMA_ENABLED", "true")
    vi.stubEnv("REDIS_ENABLED", "false")
    mocks.claim.mockResolvedValue({ history: [], draftContext: [], busyUntil: new Date() })
    mocks.chat.mockResolvedValue({ text: "Reply", drafts: [] })
    mocks.read.mockResolvedValue({ messages: [{ content: "Reply" }] })
    const response = await chat(request("chat", { conversationId, message: "Hello", locale: "en" }))
    expect(response.status).toBe(200)
    expect(mocks.chat).toHaveBeenCalledOnce()
    expect(mocks.save).toHaveBeenCalledWith("alice", conversationId, "Reply", [])
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it("keeps saved conversation history accessible while Ollama is disabled", async () => {
    mocks.transaction.mockImplementation(async (action) => action({ execute: mocks.execute, select: mocks.select }))
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ orderBy: mocks.orderBy })
    mocks.orderBy.mockReturnValue({ limit: mocks.limit })
    mocks.limit.mockResolvedValue([{ id: conversationId, title: "Saved conversation" }])
    const response = await history(new Request("http://localhost/api/ai/conversations", { headers: { host: "localhost" } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([{ id: conversationId, title: "Saved conversation" }])
    expect(mocks.execute).toHaveBeenCalledTimes(2)
    expect(mocks.chat).not.toHaveBeenCalled()
  })
})
