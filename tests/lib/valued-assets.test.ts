import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { assetMarketValue, formatAssetQuantity, parseAssetQuantity, parseValuedAccount, valuedAssetTotals, type AssetSymbol, type ValuedAccount } from "@/lib/valued-assets"
import { parseExchangeRates, parseGoldRate } from "@/lib/asset-price-parser"

const now = new Date("2026-11-27T10:00:00Z")
const fx = { result: "success", base_code: "USD", time_last_update_unix: Date.parse("2026-11-27T00:00:00Z") / 1000,
  time_next_update_unix: Date.parse("2026-11-28T00:00:00Z") / 1000,
  rates: { USD: 1, IDR: 16000, SGD: 1.25, EUR: 0.8, JPY: 160, MYR: 4, SAR: 4 } }
const gold = { symbol: "XAU", currency: "USD", price: 3110.34768, updatedAt: "2026-11-27T09:00:00Z" }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
afterEach(() => vi.useRealTimers())

describe("native gold and currency balances", () => {
  it.each([ ["XAU", "1,234567", 1.234567], ["USD", "1000,25", 1000.25], ["SGD", "0.01", 0.01], ["EUR", "12.50", 12.5], ["JPY", "1000000", 1000000], ["MYR", 0, 0], ["SAR", "1000000.00", 1000000] ] as const)("parses %s quantity %s", (symbol, input, expected) => {
    expect(parseAssetQuantity(input, symbol)).toBe(expected)
  })
  it.each([ ["XAU", "1.2345678"], ["XAU", "10000.000001"], ["USD", "1.234"], ["JPY", "1,5"], ["USD", "1.000,25"], ["USD", "1000000.01"], ["USD", "1e3"], ["USD", ""], ["USD", true], ["XAU", -1], ["XAU", Infinity] ] as const)("rejects invalid %s quantity %s", (symbol, input) => {
    expect(parseAssetQuantity(input, symbol)).toBeNull()
  })
  it("validates dated account snapshots without accepting invented prices or owners", () => {
    const input = { name: " Gold ", symbol: "XAU", quantity: "1,5", date: "2026-11-27", userId: "wrong", idrRate: 1 }
    expect(parseValuedAccount(input)).toEqual({ name: "Gold", symbol: "XAU", quantity: 1.5, date: "2026-11-27", description: "" })
    for (const change of [{ symbol: "BTC" }, { date: "2026-11-28" }, { date: "2026-02-30" }, { quantity: null }, { name: "" }])
      expect(() => parseValuedAccount({ ...input, ...change })).toThrow("invalidInput")
  })
  it("formats original units in both languages without labeling them as rupiah", () => {
    expect(formatAssetQuantity(1.234567, "XAU", "id")).toBe("1,234567 g")
    expect(formatAssetQuantity(100.25, "USD", "en")).toContain("100.25")
    expect(formatAssetQuantity(100, "JPY", "id")).toContain("JPY")
  })
  it("rounds the exact fixed-point product to IDR cents", () => {
    expect(assetMarketValue(1.5, 1600000)).toBe(2400000)
    expect(assetMarketValue(100.25, 16000)).toBe(1604000)
    expect(assetMarketValue(0.1, 0.05)).toBe(0.01)
    expect(assetMarketValue(0.000001, 10000)).toBe(0.01)
  })
  it("keeps unknown valuations incomplete while treating a zero quantity as zero", () => {
    const rows = [{ id: 1, name: "Gold", symbol: "XAU", quantity: 1, marketValue: 100.1, rate: null, stale: false },
      { id: 2, name: "USD", symbol: "USD", quantity: 1, marketValue: 0.2, rate: null, stale: true },
      { id: 3, name: "EUR", symbol: "EUR", quantity: 1, marketValue: null, rate: null, stale: false }] as ValuedAccount[]
    expect(valuedAssetTotals(rows)).toEqual({ gold: 100.1, foreignCurrency: 0.2, knownValue: 100.3, marketValue: null, unpricedCount: 1, staleCount: 1 })
    expect(valuedAssetTotals([]).marketValue).toBe(0)
  })
})

describe("reference quote validation and units", () => {
  it("converts all supported FX units to IDR, rather than inverting the rates", () => {
    const rates = parseExchangeRates(fx, now)
    const value = (symbol: AssetSymbol) => rates.find((row) => row.symbol === symbol)!.idrRate
    expect([value("USD"), value("SGD"), value("EUR"), value("JPY"), value("MYR"), value("SAR")]).toEqual([16000, 12800, 20000, 100, 4000, 4000])
  })
  it("converts USD per troy ounce into IDR per gram and preserves both observation times", () => {
    const usd = parseExchangeRates(fx, now)[0]
    const quote = parseGoldRate(gold, usd, now)
    expect(quote.idrRate).toBe(1600000)
    expect(quote.date).toBe("2026-11-27")
    expect(quote.observedAt).toEqual(new Date(gold.updatedAt))
    expect(quote.oldestInputAt).toEqual(new Date("2026-11-27T00:00:00Z"))
    expect(quote.expiresAt).toEqual(new Date("2026-11-27T10:15:00Z"))
  })
  it.each([{ result: "error" }, { base_code: "EUR" }, { rates: { ...fx.rates, USD: 2 } }, { rates: { ...fx.rates, IDR: 0 } }, { rates: { ...fx.rates, SAR: null } }, { time_last_update_unix: now.getTime() / 1000 + 3600 }, { time_next_update_unix: 1 }])("rejects invalid FX data: %s", (change) => {
    expect(() => parseExchangeRates({ ...fx, ...change }, now)).toThrow("invalidAssetRate")
  })
  it.each([{ symbol: "XAG" }, { currency: "EUR" }, { price: -1 }, { price: Infinity }, { updatedAt: "bad" }, { updatedAt: "2026-11-28T00:00:00Z" }, { updatedAt: "2026-11-01T00:00:00Z" }])("rejects invalid gold data: %s", (change) => {
    expect(() => parseGoldRate({ ...gold, ...change }, parseExchangeRates(fx, now)[0], now)).toThrow("invalidAssetRate")
  })
  it("never dates a composite gold quote before its latest source, preventing historical look-ahead", () => {
    const quote = parseGoldRate({ ...gold, updatedAt: "2026-11-26T12:00:00Z" }, parseExchangeRates(fx, now)[0], now)
    expect(quote.date).toBe("2026-11-27")
    expect(quote.oldestInputAt).toEqual(new Date("2026-11-26T12:00:00Z"))
  })
})
