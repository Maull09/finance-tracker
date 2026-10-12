import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ create: vi.fn(), connect: vi.fn(), on: vi.fn() }))
vi.mock("@redis/client", () => ({ createClient: mocks.create }))

describe("optional Redis connection", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv("REDIS_ENABLED", undefined)
    vi.stubEnv("REDIS_URL", "redis://localhost:6379")
    mocks.create.mockReturnValue({ connect: mocks.connect, on: mocks.on, isReady: false })
    mocks.connect.mockResolvedValue(undefined)
  })
  afterEach(() => vi.unstubAllEnvs())

  it("does not create a client when disabled even if a URL is configured", async () => {
    vi.stubEnv("REDIS_ENABLED", "false")
    const { getRedisClient } = await import("@/lib/server/redis")
    expect(await getRedisClient()).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  it.each([undefined, "true"])("connects to the configured Redis when REDIS_ENABLED is %s", async (enabled) => {
    vi.stubEnv("REDIS_ENABLED", enabled)
    const { getRedisClient } = await import("@/lib/server/redis")
    expect(await getRedisClient()).not.toBeNull()
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ url: "redis://localhost:6379" }))
    expect(mocks.connect).toHaveBeenCalledOnce()
  })

  it("still bypasses Redis without a URL even when enabled", async () => {
    vi.stubEnv("REDIS_ENABLED", "true")
    vi.stubEnv("REDIS_URL", "")
    const { getRedisClient } = await import("@/lib/server/redis")
    expect(await getRedisClient()).toBeNull()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
