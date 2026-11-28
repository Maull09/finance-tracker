import { FinanceError } from "./finance-errors"
import { getToday, isDate, type Locale } from "./finance"
import { recordInput, textInput } from "./planning-validation"
import { sumMoney } from "./money"

export const foreignCurrencies = ["USD", "SGD", "EUR", "JPY", "MYR", "SAR", "THB"] as const
export const assetSymbols = ["XAU", ...foreignCurrencies] as const
export type AssetSymbol = typeof assetSymbols[number]
export const gramsPerTroyOunce = 31.1034768

export type AssetRate = {
  symbol: string
  idrRate: number
  date: string
  observedAt: Date | string
  oldestInputAt: Date | string
  expiresAt: Date | string
  source: string
}
export type ValuedAccount = {
  id: number
  name: string
  symbol: AssetSymbol
  description: string | null
  quantity: number
  balanceDate: string
  marketValue: number | null
  rate: AssetRate | null
  stale: boolean
}
export type ValuedAssetTotals = {
  gold: number
  foreignCurrency: number
  knownValue: number
  marketValue: number | null
  unpricedCount: number
  staleCount: number
}
export type ValuedAccountsData = { accounts: ValuedAccount[]; totals: ValuedAssetTotals }

export function assetSymbolInput(value: unknown): AssetSymbol {
  if (!assetSymbols.includes(value as AssetSymbol)) throw new FinanceError("invalidInput")
  return value as AssetSymbol
}

export function quantityPlaces(symbol: AssetSymbol) {
  return symbol === "XAU" ? 6 : symbol === "JPY" ? 0 : 2
}

export function formatAssetQuantity(quantity: number, symbol: AssetSymbol, locale: Locale) {
  const code = locale === "id" ? "id-ID" : "en-US"
  return symbol === "XAU"
    ? new Intl.NumberFormat(code, { maximumFractionDigits: 6 }).format(quantity) + " g"
    : new Intl.NumberFormat(code, { style: "currency", currency: symbol, currencyDisplay: "code", minimumFractionDigits: 0, maximumFractionDigits: quantityPlaces(symbol) }).format(quantity)
}

export function parseAssetQuantity(value: unknown, symbol: AssetSymbol): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  const text = String(value).trim().replace(",", ".")
  const places = quantityPlaces(symbol)
  const pattern = places ? new RegExp("^\\d+(?:\\.\\d{1," + places + "})?$") : /^\d+$/
  if (!pattern.test(text)) return null
  const amount = Number(text)
  return Number.isFinite(amount) && amount >= 0 && amount <= (symbol === "XAU" ? 10_000 : 1_000_000)
    ? amount : null
}

export function parseValuedAccount(value: unknown) {
  const body = recordInput(value)
  const symbol = assetSymbolInput(body.symbol)
  const quantity = parseAssetQuantity(body.quantity, symbol)
  if (quantity === null || !isDate(body.date) || body.date < "1900-01-01" || body.date > getToday())
    throw new FinanceError("invalidInput")
  return { name: textInput(body.name), symbol, quantity, date: body.date, description: textInput(body.description, 500, false) }
}

export function assetMarketValue(quantity: number, idrRate: number): number {
  const quantityUnits = BigInt(quantity.toFixed(6).replace(".", ""))
  const rateUnits = BigInt(idrRate.toFixed(8).replace(".", ""))
  const cents = (quantityUnits * rateUnits + BigInt(500_000_000_000)) / BigInt(1_000_000_000_000)
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new FinanceError("invalidAssetRate", 502)
  return Number(cents) / 100
}

export function valuedAssetTotals(accounts: ValuedAccount[]): ValuedAssetTotals {
  const gold = sumMoney(accounts.filter((row) => row.symbol === "XAU").map((row) => row.marketValue ?? 0))
  const foreignCurrency = sumMoney(accounts.filter((row) => row.symbol !== "XAU").map((row) => row.marketValue ?? 0))
  const unpricedCount = accounts.filter((row) => row.quantity > 0 && row.marketValue === null).length
  const knownValue = sumMoney([gold, foreignCurrency])
  return { gold, foreignCurrency, knownValue, marketValue: unpricedCount ? null : knownValue, unpricedCount,
    staleCount: accounts.filter((row) => row.quantity > 0 && row.stale).length }
}
