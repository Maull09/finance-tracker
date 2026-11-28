import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { UserDatabase } from "@/lib/server/authenticated-response"
import { parseExchangeRates } from "@/lib/asset-price-parser"
import { refreshAssetRates } from "@/lib/server/asset-rates"

const now = new Date("2026-11-27T10:00:00Z")
const fx = { result: "success", base_code: "USD", time_last_update_unix: Date.parse("2026-11-27T00:00:00Z") / 1000,
  time_next_update_unix: Date.parse("2026-11-28T00:00:00Z") / 1000,
  rates: { USD: 1, IDR: 16000, SGD: 1.25, EUR: 0.8, JPY: 160, MYR: 4, SAR: 4, THB: 32 } }
const gold = { symbol: "XAU", currency: "USD", price: 3110.34768, updatedAt: "2026-11-27T09:00:00Z" }
const state = { owned: [] as Array<{ symbol: string }>, latest: [] as ReturnType<typeof parseExchangeRates>,
  values: vi.fn(), conflict: vi.fn(), returning: vi.fn(), fetch: vi.fn() }
const connection = {
  select: () => ({ from: async () => state.owned }),
  selectDistinctOn: () => ({ from: () => ({ orderBy: async () => state.latest }) }),
  insert: () => ({ values: state.values }),
} as unknown as UserDatabase

describe("reference price refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now)
    state.owned = [{ symbol: "XAU" }, { symbol: "USD" }]; state.latest = []
    state.values.mockReturnValue({ onConflictDoUpdate: state.conflict })
    state.conflict.mockReturnValue({ returning: state.returning })
    state.returning.mockResolvedValue([{ id: 1 }])
    state.fetch.mockImplementation(async (url: string) => Response.json(url.includes("gold-api") ? gold : fx))
    vi.stubGlobal("fetch", state.fetch)
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  it("fetches only fixed public endpoints and persists all FX references plus gram gold", async () => {
    expect(await refreshAssetRates(connection)).toMatchObject({ updated: 8, failures: [] })
    expect(state.fetch.mock.calls.map(([url]) => url)).toEqual(["https://open.er-api.com/v6/latest/USD", "https://api.gold-api.com/price/XAU"])
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ symbol: "XAU", idrRate: 1600000 }))
    expect(state.conflict).toHaveBeenCalledWith(expect.objectContaining({ setWhere: expect.anything() }))
  })
  it("does not request upstream prices when this user has no native accounts", async () => {
    state.owned = []
    expect(await refreshAssetRates(connection)).toEqual({ updated: 0, cached: 0, failures: [] })
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it("honors the provider's next-update time and gold cache period", async () => {
    state.latest = [...parseExchangeRates(fx, now), { symbol: "XAU", idrRate: 1600000, date: "2026-11-27", observedAt: now, oldestInputAt: now, expiresAt: new Date(now.getTime() + 1000), source: "Gold API" }]
    expect(await refreshAssetRates(connection)).toEqual({ updated: 0, cached: 2, failures: [] })
    expect(state.fetch).not.toHaveBeenCalled()
  })
  it("refreshes gold using a current cached USD rate without re-requesting daily FX", async () => {
    state.latest = parseExchangeRates(fx, now)
    expect(await refreshAssetRates(connection)).toMatchObject({ updated: 1, failures: [] })
    expect(state.fetch).toHaveBeenCalledOnce()
    expect(state.fetch.mock.calls[0][0]).toContain("gold-api")
  })
  it("fetches a missing currency even when USD is already cached", async () => {
    state.owned = [{ symbol: "SGD" }]; state.latest = [parseExchangeRates(fx, now)[0]]
    expect(await refreshAssetRates(connection)).toMatchObject({ updated: 7, failures: [] })
    expect(state.fetch.mock.calls[0][0]).toContain("open.er-api.com")
  })
  it("fetches THB when older cached FX quotes omit it", async () => {
    state.owned = [{ symbol: "THB" }]
    state.latest = parseExchangeRates(fx, now).filter((quote) => quote.symbol !== "THB")
    expect(await refreshAssetRates(connection)).toMatchObject({ updated: 7, failures: [] })
    expect(state.fetch).toHaveBeenCalledOnce()
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ symbol: "THB", idrRate: 500 }))
  })
  it("preserves existing quotes when upstream responds with invalid data", async () => {
    state.fetch.mockResolvedValue(Response.json({ result: "success", base_code: "EUR" }))
    expect(await refreshAssetRates(connection)).toMatchObject({ updated: 0, failures: [{ symbol: "XAU", code: "invalidAssetRate" }, { symbol: "USD", code: "invalidAssetRate" }] })
    expect(state.values).not.toHaveBeenCalled()
  })
  it("returns a rate-limit failure without writing guessed or zero prices", async () => {
    state.fetch.mockResolvedValue(new Response("rate limited", { status: 429 }))
    expect((await refreshAssetRates(connection)).failures[0].code).toBe("pricesRateLimited")
    expect(state.values).not.toHaveBeenCalled()
  })
  it("does not replace newer stored FX with an older provider response", async () => {
    state.latest = parseExchangeRates(fx, now).map((quote) => ({ ...quote, observedAt: now, expiresAt: new Date(now.getTime() - 1) }))
    expect((await refreshAssetRates(connection)).failures[0].code).toBe("invalidAssetRate")
    expect(state.values).not.toHaveBeenCalled()
  })
})
