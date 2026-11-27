import { asc, desc, sql } from "drizzle-orm"
import { assetRates, valuedAccounts } from "@/db/schema"
import { parseExchangeRates, parseGoldRate } from "@/lib/asset-price-parser"
import { FinanceError, type FinanceErrorCode } from "@/lib/finance-errors"
import { type AssetRate } from "@/lib/valued-assets"
import type { UserDatabase } from "./authenticated-response"

async function fetchQuote(url: "https://open.er-api.com/v6/latest/USD" | "https://api.gold-api.com/price/XAU") {
  let response: Response
  try {
    response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) })
  } catch {
    throw new FinanceError("assetRatesUnavailable", 502)
  }
  if (!response.ok) throw new FinanceError(response.status === 429 ? "pricesRateLimited" : "assetRatesUnavailable", 502)
  try { return await response.json() as unknown } catch { throw new FinanceError("invalidAssetRate", 502) }
}

async function saveRate(connection: UserDatabase, quote: AssetRate) {
  const rate = { ...quote, observedAt: new Date(quote.observedAt), oldestInputAt: new Date(quote.oldestInputAt), expiresAt: new Date(quote.expiresAt), fetchedAt: new Date() }
  const saved = await connection.insert(assetRates).values(rate).onConflictDoUpdate({
    target: [assetRates.symbol, assetRates.date], set: rate,
    setWhere: sql`${assetRates.observedAt} <= ${rate.observedAt}`,
  }).returning({ id: assetRates.id })
  return saved.length
}

export async function refreshAssetRates(connection: UserDatabase) {
  const owned = await connection.select({ symbol: valuedAccounts.symbol }).from(valuedAccounts)
  const symbols = [...new Set(owned.map((row) => row.symbol))]
  if (!symbols.length) return { updated: 0, cached: 0, failures: [] }
  const latest = await connection.selectDistinctOn([assetRates.symbol]).from(assetRates)
    .orderBy(asc(assetRates.symbol), desc(assetRates.date))
  const current = new Map<string, AssetRate>(latest.map((rate) => [rate.symbol, rate]))
  const now = new Date()
  const fresh = (symbol: string) => {
    const quote = current.get(symbol)
    return quote && new Date(quote.expiresAt) > now
  }
  const pending = symbols.filter((symbol) => !fresh(symbol))
  let updated = 0
  const cached = symbols.length - pending.length
  const failures: Array<{ symbol: string; code: FinanceErrorCode }> = []
  if (!pending.length) return { updated, cached, failures }
  if (!fresh("USD") || pending.some((symbol) => symbol !== "XAU")) {
    try {
      const quotes = parseExchangeRates(await fetchQuote("https://open.er-api.com/v6/latest/USD"), now)
      const previousUsd = current.get("USD")
      const nextUsd = quotes.find((quote) => quote.symbol === "USD")!
      if (previousUsd && new Date(nextUsd.observedAt) < new Date(previousUsd.observedAt))
        throw new FinanceError("invalidAssetRate", 502)
      for (const quote of quotes) { updated += await saveRate(connection, quote); current.set(quote.symbol, quote) }
    } catch (error) {
      const code = error instanceof FinanceError ? error.code : "assetRatesUnavailable"
      return { updated, cached, failures: pending.map((symbol) => ({ symbol, code })) }
    }
  }
  if (pending.includes("XAU")) {
    try {
      const usd = current.get("USD")
      if (!usd) throw new FinanceError("assetRatesUnavailable", 502)
      const quote = parseGoldRate(await fetchQuote("https://api.gold-api.com/price/XAU"), usd, now)
      updated += await saveRate(connection, quote)
    } catch (error) {
      failures.push({ symbol: "XAU", code: error instanceof FinanceError ? error.code : "assetRatesUnavailable" })
    }
  }
  return { updated, cached, failures }
}
