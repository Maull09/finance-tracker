import { AIMessage } from "@langchain/core/messages"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), revision: vi.fn(), summary: vi.fn(), database: vi.fn(), insert: vi.fn(), values: vi.fn(), save: vi.fn(), update: vi.fn(), inTransaction: false }))
vi.mock("@/lib/ai/model", () => ({ ollamaModel: () => ({ invoke: mocks.invoke }) }))
vi.mock("@/lib/ai/insight-summary", () => ({ readInsightSummary: mocks.summary }))
vi.mock("@/lib/ai/insight-queue", async (original) => ({ ...await original<object>(), insightRevision: mocks.revision }))
vi.mock("@/lib/server/user-database", () => ({ userDatabase: mocks.database }))
import { explainPageSummary, processPageInsight } from "@/lib/ai/page-insights"
import type { InsightJob } from "@/lib/ai/insight-queue"

describe("contextual insight worker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("REDIS_ENABLED", undefined)
    vi.stubEnv("OLLAMA_ENABLED", undefined)
    mocks.database.mockImplementation(async (_user, action) => {
      mocks.inTransaction = true
      try { return await action({ insert: mocks.insert }) } finally { mocks.inTransaction = false }
    })
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ onConflictDoNothing: mocks.save, onConflictDoUpdate: mocks.update })
    mocks.revision.mockResolvedValue("r1")
    mocks.summary.mockResolvedValue({ income: 1000000, expense: 500000 })
    mocks.invoke.mockImplementation(async () => {
      expect(mocks.inTransaction).toBe(false)
      return new AIMessage("Pengeluaran tercatat Rp500.000. Tinjau anggaran Anda.")
    })
  })
  afterEach(() => vi.unstubAllEnvs())
  const job = () => ({ id: "a".repeat(64), data: { userId: "alice", context: { page: "dashboard" }, locale: "id", revision: "r1", requestedAt: Date.now() } }) as unknown as InsightJob
  it.each(["REDIS_ENABLED", "OLLAMA_ENABLED"])("does not read financial data or infer queued jobs when %s is false", async (flag) => {
    vi.stubEnv(flag, "false")
    await expect(processPageInsight(job())).rejects.toMatchObject({ code: "aiDisabled", status: 503 })
    expect(mocks.database).not.toHaveBeenCalled()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("uses only aggregates, releases the database during inference and saves an idempotent history entry", async () => {
    const first = await processPageInsight(job())
    const second = await processPageInsight(job())
    expect(first?.conversationId).toBe(second?.conversationId)
    expect(first?.text).toContain("Rp500.000")
    expect(mocks.summary).toHaveBeenCalledWith(expect.anything(), { page: "dashboard" })
    const [messages, options] = mocks.invoke.mock.calls[0]
    expect(JSON.parse(messages[1].content)).toEqual({ income: 1000000, expense: 500000 })
    expect(messages[0].content).toContain("Indonesian")
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(mocks.database.mock.calls.every(([user]) => user === "alice")).toBe(true)
    expect(mocks.values.mock.calls.every(([value]) => value.role !== "user")).toBe(true)
  })
  it("skips obsolete queued data before inference", async () => {
    mocks.revision.mockResolvedValue("r2")
    expect(await processPageInsight(job())).toBeNull()
    expect(mocks.invoke).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("discards inference when financial records change before saving", async () => {
    mocks.revision.mockResolvedValueOnce("r1").mockResolvedValueOnce("r2")
    expect(await processPageInsight(job())).toBeNull()
    expect(mocks.invoke).toHaveBeenCalledOnce()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it("does not process jobs left waiting too long", async () => {
    const expired = job()
    expired.data.requestedAt -= 6 * 60_000
    await expect(processPageInsight(expired)).rejects.toThrow("deadline")
    expect(mocks.database).not.toHaveBeenCalled()
  })
  it("rejects empty or oversized model output", async () => {
    for (const text of [" ", "x".repeat(12001)]) {
      mocks.invoke.mockResolvedValueOnce(new AIMessage(text))
      await expect(explainPageSummary("investments", { marketValue: null }, "en")).rejects.toMatchObject({ code: "aiInvalidResponse" })
    }
  })
  it("requests a concise explanation in both languages and renders one paragraph", async () => {
    for (const locale of ["id", "en"] as const) {
      mocks.invoke.mockResolvedValueOnce(new AIMessage("Income is Rp1.000.000.\n\nExpense is Rp500.000.\nReview your budget."))
      const text = await explainPageSummary("dashboard", { income: 1000000, expense: 500000 }, locale)
      expect(text).toBe("Income is Rp1.000.000. Expense is Rp500.000. Review your budget.")
      const prompt = mocks.invoke.mock.lastCall![0][0].content
      expect(prompt).toContain("3–4 short sentences, at most 80 words")
      expect(prompt).toContain("never print JSON field names")
      expect(prompt).toContain(locale === "id" ? "Indonesian" : "English")
    }
  })
})
