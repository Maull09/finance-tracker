import { afterEach, describe, expect, it, vi } from "vitest"
import { calculateFinancialHealth, healthInputSchema, healthPeriod, type HealthInput, type HealthSnapshot } from "@/lib/financial-health"

const healthExample: HealthSnapshot = {
  month: "2026-09", asOf: "2026-09-30", partial: false,
  months: [{ month: "2026-09", income: 15_000_000, expense: 9_000_000, count: 100, transfers: 10, largestIncomeCategory: 12_000_000 }],
  liquidAssets: 30_000_000, totalAssets: 120_000_000, totalLiabilities: 30_000_000,
  recordedDebtPayments: 2_000_000, recurringExpense: 3_000_000, unpricedHoldings: 0, oldestPriceDate: null,
}
const input: HealthInput = { month: "2026-09", essentialExpense: 6_000_000, monthlyDebtPayment: 2_000_000 }

describe("deterministic financial health", () => {
  afterEach(() => vi.useRealTimers())
  it("reproduces the requested Rp15m example and score 82", () => {
    const report = calculateFinancialHealth(healthExample, input)
    expect(report).toMatchObject({ score: 82, status: "healthGood", savingsRate: 0.4, expenseRatio: 0.6,
      emergencyMonths: 5, debtToAssetRatio: 0.25, netWorth: 90_000_000, surplus: 6_000_000,
      incomeConcentration: 0.8, recurringCommitmentRatio: 0.2 })
    expect(report.debtServiceRatio).toBeCloseTo(2 / 15)
  })
  it("leaves income-based metrics unknown when income is zero", () => {
    const report = calculateFinancialHealth({ ...healthExample, months: [{ ...healthExample.months[0], income: 0 }] }, input)
    expect(report).toMatchObject({ score: null, status: "healthIncomplete", savingsRate: null,
      expenseRatio: null, debtServiceRatio: null, incomeConcentration: null, surplus: -9_000_000 })
  })
  it("never substitutes missing essential or debt inputs with zero", () => {
    expect(calculateFinancialHealth(healthExample, { ...input, essentialExpense: null })).toMatchObject({ score: null, emergencyMonths: null })
    expect(calculateFinancialHealth(healthExample, { ...input, monthlyDebtPayment: null })).toMatchObject({ score: null, debtServiceRatio: null })
    expect(calculateFinancialHealth(healthExample, { ...input, monthlyDebtPayment: 0 }).components.debtService).toBe(100)
    expect(calculateFinancialHealth(healthExample, { ...input, essentialExpense: 0 }).emergencyMonths).toBeNull()
  })
  it("clamps component scores without hiding actual negative savings or high debt ratios", () => {
    const report = calculateFinancialHealth({ ...healthExample, liquidAssets: 0, totalLiabilities: 240_000_000,
      months: [{ ...healthExample.months[0], expense: 30_000_000 }] }, { ...input, monthlyDebtPayment: 15_000_000 })
    expect(report).toMatchObject({ score: 0, savingsRate: -1, debtServiceRatio: 1, debtToAssetRatio: 2,
      components: { savings: 0, emergency: 0, debtService: 0, debtToAsset: 0 }, netWorth: -120_000_000 })
  })
  it("does not score missing stock prices or zero total assets", () => {
    expect(calculateFinancialHealth({ ...healthExample, totalAssets: null, unpricedHoldings: 1 }, input))
      .toMatchObject({ score: null, netWorth: null, debtToAssetRatio: null })
    expect(calculateFinancialHealth({ ...healthExample, totalAssets: 0 }, input))
      .toMatchObject({ score: null, netWorth: -30_000_000, debtToAssetRatio: null })
  })
  it("does not penalize transaction frequency", () => {
    const report = calculateFinancialHealth({ ...healthExample, months: [{ ...healthExample.months[0], count: 10_000, transfers: 500 }] }, input)
    expect(report.score).toBe(82)
    expect(report.transferCount).toBe(500)
  })
  it("requires three complete months, excludes a partial current month, and preserves zero gaps", () => {
    const months = [
      { ...healthExample.months[0], month: "2026-06", income: 100, expense: 100 },
      { ...healthExample.months[0], month: "2026-07", income: 0, expense: 0, count: 0 },
      { ...healthExample.months[0], month: "2026-08", income: 300, expense: 200 },
      { ...healthExample.months[0], month: "2026-09", income: 1_000_000, expense: 1_000_000 },
    ]
    const report = calculateFinancialHealth({ ...healthExample, months, partial: true }, input)
    expect(report.historyMonths).toBe(3)
    expect(report.cashFlowDeviation).toBeCloseTo(Math.sqrt(20_000 / 9))
    expect(report.spendingVolatility).toBeCloseTo(Math.sqrt(20_000 / 3) / 100)
    expect(calculateFinancialHealth({ ...healthExample, months: months.slice(1), partial: true }, input).cashFlowDeviation).toBeNull()
  })
  it("caps history at six completed months and handles zero mean expenses", () => {
    const months = Array.from({ length: 7 }, (_, index) => ({ ...healthExample.months[0],
      month: `2026-${String(index + 3).padStart(2, "0")}`, expense: 0 }))
    const report = calculateFinancialHealth({ ...healthExample, months }, input)
    expect(report.historyMonths).toBe(6)
    expect(report.spendingVolatility).toBeNull()
    expect(report.cashFlowDeviation).toBe(0)
  })
  it("validates periods and amounts and uses Jakarta dates", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-30T18:00:00Z"))
    expect(healthPeriod("2026-10").asOf).toBe("2026-10-01")
    expect(healthPeriod("2024-02").asOf).toBe("2024-02-29")
    for (const invalid of [{ month: "2026-13" }, { month: "2026-11" }, { month: "0000-01" },
      { essentialExpense: -1 }, { monthlyDebtPayment: 0.555 }, { essentialExpense: Infinity }, { unexpected: true }])
      expect(healthInputSchema.safeParse({ ...input, ...invalid }).success).toBe(false)
  })
})
