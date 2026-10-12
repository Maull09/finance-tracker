import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  getUser: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
  headers: new Headers(),
  cacheKey: vi.fn(),
  cacheRead: vi.fn(),
  cacheWrite: vi.fn(),
}))
vi.mock("next/headers", () => ({ headers: async () => state.headers }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: state.getUser } }),
}))
vi.mock("@/db", () => ({ db: { transaction: state.transaction } }))
vi.mock("@/lib/server/api-cache", () => ({
  apiCacheKey: state.cacheKey,
  readApiCache: state.cacheRead,
  writeApiCache: state.cacheWrite,
}))
import { authenticatedResponse } from "@/lib/server/authenticated-response"

describe("authenticated financial boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("REDIS_ENABLED", undefined)
    vi.stubEnv("REDIS_URL", "")
    state.headers = new Headers({ host: "localhost:3000" })
    state.getUser.mockResolvedValue({
      data: { user: { id: "00000000-0000-4000-8000-000000000001" } },
      error: null,
    })
    state.execute.mockResolvedValue(undefined)
    state.transaction.mockImplementation(async (action) =>
      action({ execute: state.execute }),
    )
    state.cacheKey.mockResolvedValue("user-cache-key")
    state.cacheRead.mockResolvedValue(null)
    state.cacheWrite.mockResolvedValue(undefined)
  })
  afterEach(() => vi.unstubAllEnvs())
  it("rejects a missing or expired session before accessing the database", async () => {
    state.getUser.mockResolvedValue({
      data: { user: null },
      error: { code: "session_not_found" },
    })
    const action = vi.fn()
    const response = await authenticatedResponse(action)
    expect(response.status).toBe(401)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(action).not.toHaveBeenCalled()
    expect(state.transaction).not.toHaveBeenCalled()
  })
  it("refuses cross-origin requests even with valid cookies", async () => {
    state.headers.set("origin", "https://evil.test")
    const response = await authenticatedResponse(vi.fn())
    expect(response.status).toBe(403)
    expect(state.getUser).not.toHaveBeenCalled()
  })
  it("initializes the restricted transaction before allowing data access", async () => {
    const response = await authenticatedResponse(async (connection) => {
      expect(connection).toHaveProperty("execute")
      expect(state.execute).toHaveBeenCalledTimes(2)
      return Response.json({ ok: true })
    })
    expect(response.status).toBe(200)
    expect(state.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "serializable",
    })
  })
  it("serves a cache hit only after authentication and restricted database access", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    state.cacheRead.mockResolvedValue('{"balance":12345}')
    state.cacheKey.mockImplementation(async () => {
      expect(state.getUser).toHaveBeenCalledOnce()
      expect(state.execute).toHaveBeenCalledTimes(2)
      return "user-cache-key"
    })
    const action = vi.fn()
    const request = new Request("http://localhost:3000/api/dashboard")
    const response = await authenticatedResponse(action, request)
    expect(await response.json()).toEqual({ balance: 12345 })
    expect(response.headers.get("X-Finance-Cache")).toBe("HIT")
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(state.cacheKey).toHaveBeenCalledWith(expect.anything(), "00000000-0000-4000-8000-000000000001", request)
    expect(action).not.toHaveBeenCalled()
    expect(state.cacheWrite).not.toHaveBeenCalled()
  })
  it("reads live financial data without cache queries when Redis is disabled despite a configured URL", async () => {
    vi.stubEnv("REDIS_ENABLED", "false")
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    state.cacheRead.mockResolvedValue('{"balance":999}')
    const action = vi.fn().mockResolvedValue(Response.json({ balance: 10 }))
    const response = await authenticatedResponse(action, new Request("http://localhost:3000/api/dashboard"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ balance: 10 })
    expect(response.headers.get("X-Finance-Cache")).toBe("BYPASS")
    expect(action).toHaveBeenCalledOnce()
    expect(state.execute).toHaveBeenCalledTimes(2)
    expect(state.cacheKey).not.toHaveBeenCalled()
    expect(state.cacheRead).not.toHaveBeenCalled()
    expect(state.cacheWrite).not.toHaveBeenCalled()
  })
  it("does not read cached financial data for an expired session", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    state.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const response = await authenticatedResponse(vi.fn(), new Request("http://localhost:3000/api/dashboard"))
    expect(response.status).toBe(401)
    expect(state.cacheKey).not.toHaveBeenCalled()
    expect(state.cacheRead).not.toHaveBeenCalled()
  })
  it("publishes cache misses after the database commit", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    let committed = false
    state.transaction.mockImplementation(async (action) => {
      const response = await action({ execute: state.execute })
      expect(state.cacheWrite).not.toHaveBeenCalled()
      committed = true
      return response
    })
    state.cacheWrite.mockImplementation(async () => { expect(committed).toBe(true) })
    const response = await authenticatedResponse(async () => Response.json({ balance: 10 }), new Request("http://localhost:3000/api/dashboard"))
    expect(response.headers.get("X-Finance-Cache")).toBe("MISS")
    expect(state.cacheWrite).toHaveBeenCalledWith("user-cache-key", '{"balance":10}')
  })
  it("does not cache a transaction that fails to commit", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    state.transaction.mockImplementation(async (action) => {
      await action({ execute: state.execute })
      throw { code: "40001" }
    })
    const response = await authenticatedResponse(async () => Response.json({ balance: 10 }), new Request("http://localhost:3000/api/dashboard"))
    expect(response.status).toBe(409)
    expect(state.cacheWrite).not.toHaveBeenCalled()
  })
  it.each([400, 404, 500])("does not cache a %s response", async (status) => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    await authenticatedResponse(async () => Response.json({ code: "invalidInput" }, { status }), new Request("http://localhost:3000/api/transactions"))
    expect(state.cacheWrite).not.toHaveBeenCalled()
  })
  it("does not cache responses that set cookies", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    await authenticatedResponse(async () => Response.json({ ok: true }, { headers: { "Set-Cookie": "session=value" } }), new Request("http://localhost:3000/api/accounts"))
    expect(state.cacheWrite).not.toHaveBeenCalled()
  })
  it("bypasses Redis for mutations", async () => {
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    const response = await authenticatedResponse(async () => Response.json({ ok: true }), new Request("http://localhost:3000/api/accounts", { method: "POST" }))
    expect(response.headers.get("X-Finance-Cache")).toBe("BYPASS")
    expect(state.cacheKey).not.toHaveBeenCalled()
    expect(state.cacheWrite).not.toHaveBeenCalled()
  })
})
