import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), transaction: vi.fn(), execute: vi.fn(), enqueue: vi.fn(), getJob: vi.fn(), revision: vi.fn(), status: vi.fn() }))
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock("@/lib/ai/insight-queue", async (original) => ({
  ...await original<object>(),
  withInsightQueue: async (action: (queue: unknown) => unknown) => action({ getJob: mocks.getJob }),
  enqueueInsight: mocks.enqueue, insightRevision: mocks.revision, readInsightStatus: mocks.status,
}))
import { GET, POST } from "@/app/api/ai/insights/route"

describe("insight API ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("REDIS_ENABLED", undefined)
    vi.stubEnv("OLLAMA_ENABLED", undefined)
    mocks.getUser.mockResolvedValue({ data: { user: { id: "alice" } }, error: null })
    mocks.transaction.mockImplementation(async (action) => action({ execute: mocks.execute }))
    mocks.revision.mockResolvedValue("r1")
    mocks.enqueue.mockResolvedValue({ id: "job" })
    mocks.status.mockResolvedValue({ jobId: "job", status: "waiting" })
  })
  afterEach(() => vi.unstubAllEnvs())
  const post = (body: unknown) => new Request("http://localhost:3000/api/ai/insights", { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) })
  it("authenticates before queue access and ignores no client-supplied identity", async () => {
    const input = { context: { page: "dashboard" }, locale: "id" }
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    expect((await POST(post(input))).status).toBe(401)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect((await POST(post({ ...input, userId: "bob" }))).status).toBe(400)
    expect(mocks.enqueue).not.toHaveBeenCalled()
    const response = await POST(post(input))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.anything(), "alice", expect.objectContaining(input), "r1")
  })
  it("does not reveal another user's job, result or internal failure", async () => {
    mocks.getJob.mockResolvedValue({ data: { userId: "bob" }, returnvalue: { text: "Private result" } })
    const response = await GET(new Request("http://localhost:3000/api/ai/insights?jobId=" + "a".repeat(64), { headers: { host: "localhost:3000" } }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ code: "recordMissing" })
    expect(mocks.status).not.toHaveBeenCalled()
    expect(mocks.revision).not.toHaveBeenCalled()
  })
  it("rejects cross-origin requests and malformed job identifiers before queue access", async () => {
    expect((await GET(new Request("http://localhost:3000/api/ai/insights?jobId=invalid", { headers: { host: "localhost:3000" } }))).status).toBe(400)
    expect((await POST(new Request("http://localhost:3000/api/ai/insights", { method: "POST", headers: { host: "localhost:3000", origin: "https://foreign.example" }, body: "{}" }))).status).toBe(403)
    expect(mocks.getJob).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
  it.each(["REDIS_ENABLED", "OLLAMA_ENABLED"])("returns a disabled response without database or queue access when %s is false", async (flag) => {
    vi.stubEnv(flag, "false")
    const response = await POST(post({ context: { page: "dashboard" }, locale: "id" }))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ code: "aiDisabled" })
    expect((await GET(new Request("http://localhost:3000/api/ai/insights?jobId=" + "a".repeat(64), { headers: { host: "localhost:3000" } }))).status).toBe(503)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.revision).not.toHaveBeenCalled()
    expect(mocks.enqueue).not.toHaveBeenCalled()
    expect(mocks.getJob).not.toHaveBeenCalled()
  })
})
