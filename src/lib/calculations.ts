import { getNextMonthStart, type Locale } from "./finance"
import { messages } from "./i18n"

export type LedgerTransaction = {
  type: "income" | "expense" | "transfer"
  amount: number
  accountId: number
  destinationAccountId: number | null
  date: string
}

export function calculateAccountBalance(
  initialBalance: number,
  accountId: number,
  transactions: LedgerTransaction[],
) {
  return transactions.reduce((balanceCents, transaction) => {
    const amountCents = Math.round(transaction.amount * 100)
    if (transaction.accountId === accountId && transaction.type === "income")
      return balanceCents + amountCents
    if (
      transaction.accountId === accountId &&
      (transaction.type === "expense" || transaction.type === "transfer")
    )
      return balanceCents - amountCents
    if (
      transaction.destinationAccountId === accountId &&
      transaction.type === "transfer"
    )
      return balanceCents + amountCents
    return balanceCents
  }, Math.round(initialBalance * 100)) / 100
}

export function calculateBudgetCarryover(
  previousBudget: number,
  previousSpent: number,
  enabled: boolean,
) {
  return enabled ? Math.max(previousBudget - previousSpent, 0) : 0
}

export function calculateForecast(
  currentBalance: number,
  transactions: Array<{
    type: "income" | "expense" | "transfer"
    amount: number
  }>,
) {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === "income") return balance + transaction.amount
    if (transaction.type === "expense") return balance - transaction.amount
    return balance
  }, currentBalance)
}

export function getPreviousPeriod(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const current = `${year}-${String(monthNumber).padStart(2, "0")}`
  const previousStart = new Date(`${current}-01T00:00:00Z`)
  previousStart.setUTCMonth(previousStart.getUTCMonth() - 1)
  return previousStart.toISOString().slice(0, 7)
}

export function getPeriodRange(month: string) {
  return { start: `${month}-01`, end: getNextMonthStart(month) }
}

export function getCategoryInsight(
  category: string,
  currentAmount: number,
  previousAmount: number,
  locale: Locale = "id",
) {
  if (previousAmount === 0 || currentAmount === previousAmount) return null
  const change = Math.round(
    ((currentAmount - previousAmount) / previousAmount) * 100,
  )
  if (locale === "en")
    return `${messages.en[category] ?? category} spending ${change > 0 ? "increased" : "decreased"} ${Math.abs(change)}% compared with last month.`
  const direction = change > 0 ? "naik" : "turun"
  return `Pengeluaran ${category} ${direction} ${Math.abs(change)}% dibanding bulan lalu.`
}
