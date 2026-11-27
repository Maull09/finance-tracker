import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { parseAccountInput, parseBudgetInput } from "@/lib/validation"
import { moneyInput, parseDebt, parseFund, parseGoal, parseOccurrenceRecording, parseRecurring, parseSimulation, parseStockTrade } from "@/lib/planning-validation"
import { confirmedDraftSchema, receiptSchema } from "@/lib/ai/validation"
import { healthInputSchema } from "@/lib/financial-health"
import { insightContextSchema } from "@/lib/ai/insight-contract"
import { sumMoney } from "@/lib/money"
import { calculateBudgetCarryover, calculateForecast } from "@/lib/calculations"
import { fundBalance, monthlyFundSaving, projectNetWorth, simulateCashflow } from "@/lib/planning"

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-23T05:00:00Z")) })
afterEach(() => vi.useRealTimers())
const recurring = { name: "Internet", type: "expense", category: "Tagihan", accountId: 1, frequency: "monthly", startDate: "2026-11-23" }
const draft = { type: "expense", category: "Makanan", description: "Lunch", date: "2026-11-23", accountId: 1, destinationAccountId: null }
const parsers = [
  ["budget", (amount: unknown) => parseBudgetInput({ category: "Makanan", budget: amount, periodStart: "2026-11" })?.budget ?? null],
  ["debt", (amount: unknown) => parseDebt({ type: "utang", name: "Loan", amount }).amount],
  ["goal", (amount: unknown) => parseGoal({ title: "Goal", targetAmount: amount, targetDate: "2026-12-01" }).targetAmount],
  ["fund", (amount: unknown) => parseFund({ name: "Fund", targetAmount: amount, accountId: 1, targetDate: "2026-12-01" }).targetAmount],
  ["schedule", (amount: unknown) => parseRecurring({ ...recurring, amount }).amount],
  ["actual recording", (amount: unknown) => parseOccurrenceRecording({ scheduledDate: "2026-11-30", date: "2026-11-23", amount }).amount],
  ["simulation", (amount: unknown) => parseSimulation({ endDate: "2026-12-31", extraIncomes: [{ name: "Income", amount, date: "2026-11-23" }], extraExpenses: [] }).extraIncomes[0].amount],
  ["stock fees", (amount: unknown) => parseStockTrade({ symbol: "BBCA", side: "buy", lots: 1, price: 10000, fees: amount, accountId: 1, date: "2026-11-23" }).fees],
] as const

describe("decimal money throughout financial inputs", () => {
  it.each(parsers)("accepts comma, dot and numeric decimals for %s", (_name, parse) => {
    for (const amount of [594585.79, "594585.79", "594585,79"]) expect(parse(amount)).toBe(594585.79)
    expect(parse("0,01")).toBe(0.01)
  })
  it.each(parsers)("rejects invalid precision, grouping and unsafe values for %s", (name, parse) => {
    for (const amount of ["1,234", "1.234", "1.234,56", true, null, "", "1e3", -1, Infinity, 2147483648]) {
      if (name === "stock fees" && amount === null) continue
      let result
      try { result = parse(amount) } catch (error) {
        expect((error as Error).message).toBe("invalidInput")
        result = null
      }
      expect(result).toBeNull()
    }
  })
  it("retains signed opening balances, optional zero and the existing limits", () => {
    const account = { name: "Bank", type: "bank" }
    expect(parseAccountInput({ ...account, initialBalance: "-594585,79" })?.initialBalance).toBe(-594585.79)
    expect(parseAccountInput({ ...account, initialBalance: "0,00" })?.initialBalance).toBe(0)
    expect(parseAccountInput(account)?.initialBalance).toBe(0)
    expect(parseAccountInput({ ...account, initialBalance: "1,234" })).toBeNull()
    expect(parseAccountInput({ ...account, initialBalance: "-2147483648,01" })).toBeNull()
    expect(moneyInput("0", 0)).toBe(0)
    expect(() => moneyInput("0")).toThrow("invalidInput")
    expect(() => parseRecurring({ ...recurring, amount: 0.1, accountId: 1.1 })).toThrow("invalidInput")
  })
  it("accepts cents in AI drafts and receipt totals while rejecting extra precision", () => {
    expect(confirmedDraftSchema.safeParse({ ...draft, amount: 594585.79 }).success).toBe(true)
    const receipt = { merchant: null, total: 594585.79, currency: "IDR", date: null, category: "Lainnya", notes: "" }
    expect(receiptSchema.safeParse(receipt).success).toBe(true)
    expect(receiptSchema.safeParse({ ...receipt, total: 594585.791 }).success).toBe(false)
    expect(confirmedDraftSchema.safeParse({ ...draft, amount: 0.001 }).success).toBe(false)
  })
  it("uses the same decimal contract for health inputs and simulation insights", () => {
    expect(healthInputSchema.safeParse({ month: "2026-11", essentialExpense: 0.01, monthlyDebtPayment: 594585.79 }).success).toBe(true)
    expect(insightContextSchema.safeParse({ page: "simulation", input: { endDate: "2026-12-31", extraIncomes: [{ amount: 594585.79, date: "2026-11-23" }], extraExpenses: [] } }).success).toBe(true)
  })
})

describe("cent precision in calculations", () => {
  it("keeps carryover, forecasts and fund balances exact", () => {
    expect(sumMoney([0.1, 0.2, -0.3])).toBe(0)
    expect(calculateBudgetCarryover(100.3, 100.1, true)).toBe(0.2)
    expect(calculateForecast(0.1, [{ type: "income", amount: 0.2 }])).toBe(0.3)
    expect(fundBalance([{ kind: "allocate", amount: 0.3 }, { kind: "release", amount: 0.1 }, { kind: "spend", amount: 0.2 }])).toBe(0)
    expect(monthlyFundSaving(1, 0, "2027-01-01", "2026-11-23")).toBe(0.34)
  })
  it("keeps monthly projections and net-worth differences exact", () => {
    const cashflow = simulateCashflow(0.1, [], "2026-11-23", "2026-12-31", [{ name: "Income", amount: 0.2, date: "2026-12-01" }], [])
    expect(cashflow.scenario).toBe(0.3)
    expect(cashflow.difference).toBe(0.2)
    const projection = projectNetWorth(cashflow, { currentBalance: 0.1, grossWorth: 0.3, knownNetWorth: 0.2, netWorth: 0.2 })
    expect(projection.projectedGrossWorth).toBe(0.5)
    expect(projection.projectedNetWorth).toBe(0.4)
  })
})
