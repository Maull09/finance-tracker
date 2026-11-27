import { z } from "zod"
import { getCurrentMonth, getNextMonthStart, getToday, isMonth } from "./finance"
import { nonnegativeMoneySchema } from "./money-schema"
import { sumMoney } from "./money"

const optionalAmount = nonnegativeMoneySchema.nullable()

export const healthInputSchema = z.object({
  month: z.string().refine(isMonth).refine((month) => month >= "1900-01" && month <= getCurrentMonth()),
  essentialExpense: optionalAmount,
  monthlyDebtPayment: optionalAmount,
}).strict()

export type HealthInput = z.infer<typeof healthInputSchema>
export type HealthMonth = { month: string; income: number; expense: number; count: number; transfers: number; largestIncomeCategory: number }
export type HealthSnapshot = {
  month: string
  asOf: string
  partial: boolean
  months: HealthMonth[]
  liquidAssets: number
  totalAssets: number | null
  totalLiabilities: number
  recordedDebtPayments: number
  recurringExpense: number
  unpricedHoldings: number
  oldestPriceDate: string | null
}

export function healthPeriod(month: string) {
  const end = getNextMonthStart(month)
  const closingDate = new Date(`${end}T00:00:00Z`)
  closingDate.setUTCDate(closingDate.getUTCDate() - 1)
  const asOf = month === getCurrentMonth() ? getToday() : closingDate.toISOString().slice(0, 10)
  const historyStart = new Date(`${month}-01T00:00:00Z`)
  historyStart.setUTCMonth(historyStart.getUTCMonth() - 6)
  return { start: `${month}-01`, end, asOf, historyStart: historyStart.toISOString().slice(0, 10) }
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null
}

function standardDeviation(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}

export function calculateFinancialHealth(snapshot: HealthSnapshot, input: HealthInput) {
  const current = snapshot.months.find((row) => row.month === snapshot.month)
  const income = current?.income ?? 0
  const expense = current?.expense ?? 0
  const savingsRate = ratio(income - expense, income)
  const emergencyMonths = input.essentialExpense === null ? null : ratio(snapshot.liquidAssets, input.essentialExpense)
  const debtServiceRatio = input.monthlyDebtPayment === null ? null : ratio(input.monthlyDebtPayment, income)
  const debtToAssetRatio = snapshot.totalAssets === null ? null : ratio(snapshot.totalLiabilities, snapshot.totalAssets)
  const clamp = (value: number) => Math.min(100, Math.max(0, value))
  const components = {
    savings: savingsRate === null ? null : clamp(savingsRate / 0.2 * 100),
    emergency: emergencyMonths === null ? null : clamp(emergencyMonths / 6 * 100),
    debtService: debtServiceRatio === null ? null : clamp((1 - debtServiceRatio / 0.4) * 100),
    debtToAsset: debtToAssetRatio === null ? null : clamp((1 - debtToAssetRatio / 0.8) * 100),
  }
  const { savings, emergency, debtService, debtToAsset } = components
  const score = savings === null || emergency === null || debtService === null || debtToAsset === null
    ? null : Math.round(0.3 * savings + 0.3 * emergency + 0.25 * debtService + 0.15 * debtToAsset)
  const firstRecordedMonth = snapshot.months.find((row) => row.count > 0)?.month
  const history = firstRecordedMonth ? snapshot.months.filter((row) =>
    row.month >= firstRecordedMonth && (row.month < snapshot.month || !snapshot.partial)).slice(-6) : []
  const meanExpense = history.length ? history.reduce((sum, row) => sum + row.expense, 0) / history.length : 0
  return {
    ...snapshot,
    input,
    income,
    expense,
    surplus: sumMoney([income, -expense]),
    savingsRate,
    expenseRatio: ratio(expense, income),
    emergencyMonths,
    debtServiceRatio,
    debtToAssetRatio,
    netWorth: snapshot.totalAssets === null ? null : sumMoney([snapshot.totalAssets, -snapshot.totalLiabilities]),
    cashFlowDeviation: history.length >= 3 ? standardDeviation(history.map((row) => row.income - row.expense)) : null,
    spendingVolatility: history.length >= 3 && meanExpense > 0 ? standardDeviation(history.map((row) => row.expense)) / meanExpense : null,
    historyMonths: history.length,
    recurringCommitmentRatio: ratio(snapshot.recurringExpense, income),
    incomeConcentration: ratio(current?.largestIncomeCategory ?? 0, income),
    transactionCount: current?.count ?? 0,
    transferCount: current?.transfers ?? 0,
    components,
    score,
    status: score === null ? "healthIncomplete" : score >= 80 ? "healthGood" : score >= 60 ? "healthFair" : "healthNeedsAttention",
  }
}

export type FinancialHealthReport = ReturnType<typeof calculateFinancialHealth>
