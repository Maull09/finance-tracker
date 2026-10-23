export const accountTypes = ["cash", "bank", "investment", "ewallet", "other"] as const
export const transactionTypes = ["income", "expense", "transfer"] as const
export { incomeCategories, expenseCategories } from "./categories"

export type AccountType = (typeof accountTypes)[number]
export type TransactionType = (typeof transactionTypes)[number]
export type Locale = "en" | "id"

const localeCodes: Record<Locale, string> = { en: "en-US", id: "id-ID" }

export function formatCurrency(amount: number, locale: Locale = "id") {
  return new Intl.NumberFormat(localeCodes[locale], { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount).replace(/Rp\s*/u, "Rp\u00a0")
}

export function formatStockQuantity(amount: number, locale: Locale = "id", maximumFractionDigits = 4) {
  return new Intl.NumberFormat(localeCodes[locale], { maximumFractionDigits }).format(amount)
}

export function formatStockPrice(amount: number, locale: Locale = "id") {
  return new Intl.NumberFormat(localeCodes[locale], { style: "currency", currency: "IDR", minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(amount).replace(/Rp\s*/u, "Rp\u00a0")
}

export function getToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${values.year}-${values.month}-${values.day}`
}

export function getCurrentMonth() {
  return getToday().slice(0, 7)
}

export function getMonthStart(month: string) {
  return `${month}-01`
}

export function getNextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const nextMonth = new Date(Date.UTC(year, monthNumber, 1))

  return nextMonth.toISOString().slice(0, 7) + "-01"
}

export function getRecentMonths(count: number) {
  const [currentYear, currentMonth] = getCurrentMonth().split("-").map(Number)
  const months: string[] = []

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(currentYear, currentMonth - 1 - offset, 1))
    months.push(date.toISOString().slice(0, 7))
  }

  return months
}

export function formatMonth(month: string, locale: Locale = "id") {
  return new Intl.DateTimeFormat(localeCodes[locale], {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`))
}

export function formatDate(date: string, locale: Locale = "id") {
  return new Intl.DateTimeFormat(localeCodes[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}
