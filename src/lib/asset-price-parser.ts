import { z } from "zod"
import { FinanceError } from "./finance-errors"
import { foreignCurrencies, gramsPerTroyOunce, type AssetRate, type AssetSymbol } from "./valued-assets"

const positive = z.number().finite().positive().max(1_000_000_000)
const exchangeSchema = z.object({ result: z.literal("success"), base_code: z.literal("USD"),
  time_last_update_unix: z.number().int().positive(), time_next_update_unix: z.number().int().positive(),
  rates: z.object({ USD: z.literal(1), IDR: positive, SGD: positive, EUR: positive, JPY: positive, MYR: positive, SAR: positive }),
})
const goldSchema = z.object({ symbol: z.literal("XAU"), currency: z.literal("USD"), price: positive,
  updatedAt: z.iso.datetime({ offset: true }),
})

function observedDate(value: Date) {
  return new Date(value.getTime() + 7 * 3600000).toISOString().slice(0, 10)
}

function validateObservation(value: Date, now: Date) {
  const age = now.getTime() - value.getTime()
  if (!Number.isFinite(age) || age < -300000 || age > 7 * 86400000)
    throw new FinanceError("invalidAssetRate", 502)
}

function rateValue(symbol: AssetSymbol, rate: number) {
  if (!Number.isFinite(rate) || rate <= 0 || rate > (symbol === "XAU" ? 100_000_000 : 1_000_000))
    throw new FinanceError("invalidAssetRate", 502)
  const rounded = Number(rate.toFixed(8))
  if (!rounded) throw new FinanceError("invalidAssetRate", 502)
  return rounded
}

export function parseExchangeRates(value: unknown, now = new Date()): AssetRate[] {
  const parsed = exchangeSchema.safeParse(value)
  if (!parsed.success) throw new FinanceError("invalidAssetRate", 502)
  const data = parsed.data
  const observedAt = new Date(data.time_last_update_unix * 1000)
  const expiresAt = new Date(data.time_next_update_unix * 1000)
  validateObservation(observedAt, now)
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + 3 * 86400000 || expiresAt <= observedAt)
    throw new FinanceError("invalidAssetRate", 502)
  return foreignCurrencies.map((symbol) => ({ symbol,
    idrRate: rateValue(symbol, data.rates.IDR / data.rates[symbol]), date: observedDate(observedAt),
    observedAt, oldestInputAt: observedAt, expiresAt, source: "ExchangeRate-API",
  }))
}

export function parseGoldRate(value: unknown, usd: AssetRate, now = new Date()): AssetRate {
  const parsed = goldSchema.safeParse(value)
  if (!parsed.success || usd.symbol !== "USD") throw new FinanceError("invalidAssetRate", 502)
  const goldAt = new Date(parsed.data.updatedAt)
  const usdAt = new Date(usd.observedAt)
  validateObservation(goldAt, now)
  validateObservation(usdAt, now)
  const observedAt = new Date(Math.max(goldAt.getTime(), usdAt.getTime()))
  return { symbol: "XAU", idrRate: rateValue("XAU", parsed.data.price * usd.idrRate / gramsPerTroyOunce),
    date: observedDate(observedAt), observedAt,
    oldestInputAt: new Date(Math.min(goldAt.getTime(), usdAt.getTime())),
    expiresAt: new Date(Math.min(now.getTime() + 15 * 60000, new Date(usd.expiresAt).getTime())),
    source: "Gold API / ExchangeRate-API",
  }
}
