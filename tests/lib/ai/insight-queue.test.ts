import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ ready: vi.fn(), on: vi.fn() }))
vi.mock("bullmq", () => ({ Queue: class {
  waitUntilReady = mocks.ready
  on = mocks.on
} }))
vi.mock("ioredis", () => ({ default: class {} }))
import { getInsightQueue, insightConnection, withInsightQueue } from "@/lib/ai/insight-queue"

describe("insight queue availability", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("REDIS_ENABLED", undefined)
    vi.stubEnv("OLLAMA_ENABLED", undefined)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
  it("returns a bounded failure during startup outage and can recover on the next request", async () => {
    vi.useFakeTimers()
    vi.stubEnv("INSIGHTS_REDIS_URL", "redis://127.0.0.1:6380")
    mocks.ready.mockImplementationOnce(() => new Promise(() => {}))
    const action = vi.fn().mockResolvedValue("ready")
    const unavailable = expect(withInsightQueue(action)).rejects.toMatchObject({ code: "aiUnavailable", status: 503 })
    await vi.advanceTimersByTimeAsync(3000)
    await unavailable
    expect(action).not.toHaveBeenCalled()
    mocks.ready.mockResolvedValueOnce(undefined)
    expect(await withInsightQueue(action)).toBe("ready")
    expect(action).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each(["REDIS_ENABLED", "OLLAMA_ENABLED"])("skips even an existing queue and its connections when %s is false", async (flag) => {
    vi.stubEnv(flag, "false")
    vi.stubEnv("INSIGHTS_REDIS_URL", "redis://localhost:6380")
    expect(() => getInsightQueue()).toThrow("aiDisabled")
    expect(() => insightConnection()).toThrow("aiDisabled")
    expect(() => insightConnection(true)).toThrow("aiDisabled")
    const action = vi.fn()
    await expect(withInsightQueue(action)).rejects.toMatchObject({ code: "aiDisabled", status: 503 })
    expect(mocks.ready).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
  })
})
