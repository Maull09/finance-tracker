import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  integerInput,
  parseFund,
  parseGoal,
  parseDebt,
  parseRecurring,
  parseSimulation,
  parseStockTrade,
  symbolInput,
} from "@/lib/planning-validation"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-03T05:00:00Z"))
})
afterEach(() => vi.useRealTimers())
const trade = {
  symbol: "bbca",
  side: "buy",
  accountId: 1,
  lots: 2,
  price: 8500,
  fees: 1000,
  date: "2026-10-03",
}

describe("financial planning validation", () => {
  const goal = {
    title: "Emergency reserve",
    targetAmount: 1000000,
    targetDate: "2026-12-01",
  }
  const debt = { type: "utang", name: "Car loan", amount: 500000 }
  const recurring = {
    name: "Internet",
    type: "expense",
    accountId: 1,
    amount: 300000,
    category: "Tagihan",
    frequency: "monthly",
    startDate: "2026-10-03",
  }
  it("parses metadata without synthesizing goal progress or debt payments", () => {
    expect(parseGoal(goal)).toEqual({
      ...goal,
      category: "other",
      description: "",
    })
    expect(parseDebt(debt)).toEqual({ ...debt, description: "", dueDate: null })
    expect(parseRecurring(recurring)).toMatchObject({
      ...recurring,
      endDate: null,
      destinationAccountId: null,
    })
    expect(parseRecurring(recurring)).not.toHaveProperty("date")
  })
  it.each([
    { currentAmount: 0 },
    { title: true },
    { targetDate: "2026-02-30" },
    { targetAmount: 2147483648 },
    { description: [] },
    { title: "x".repeat(121) },
  ])("rejects invalid goal metadata: %s", (override) => {
    expect(() => parseGoal({ ...goal, ...override })).toThrow("invalidInput")
  })
  it.each([
    { status: "paid" },
    { paidDate: null },
    { paidAmount: 0 },
    { type: "expense" },
    { name: {} },
    { dueDate: "2026-02-30" },
    { amount: 1.555 },
    { amount: 2147483648 },
  ])("rejects invalid debt metadata: %s", (override) => {
    expect(() => parseDebt({ ...debt, ...override })).toThrow("invalidInput")
  })
  it.each([
    { endDate: "2026-10-02" },
    { endDate: "2026-02-30" },
    { frequency: "daily" },
    { amount: 1.255 },
    { startDate: "2026-02-30" },
    { name: null },
    { accountId: true },
    { type: "transfer", destinationAccountId: 1 },
  ])("rejects invalid recurring metadata: %s", (override) => {
    expect(() => parseRecurring({ ...recurring, ...override })).toThrow(
      "invalidInput",
    )
  })
  it("supports recurring transfers and optional end dates", () => {
    expect(
      parseRecurring({
        ...recurring,
        type: "transfer",
        destinationAccountId: 2,
        endDate: "2026-12-31",
      }),
    ).toMatchObject({
      type: "transfer",
      destinationAccountId: 2,
      endDate: "2026-12-31",
    })
  })
  it("normalizes IDX symbols and converts lots to shares", () => {
    expect(parseStockTrade(trade)).toMatchObject({
      symbol: "BBCA",
      shares: 200,
      price: 8500,
      fees: 1000,
    })
  })
  it.each([
    true,
    null,
    "",
    "1.5",
    "NaN",
    -1,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ])("rejects unsafe financial quantities: %s", (value) => {
    expect(() => integerInput(value)).toThrow("invalidInput")
  })
  it.each(["BBCA.JK", "AAPL:NASDAQ", "BB", "1234", "<BB>"])(
    "rejects unsupported or unsafe ticker: %s",
    (symbol) => {
      expect(() => symbolInput(symbol)).toThrow("invalidInput")
    },
  )
  it.each([
    { lots: 0 },
    { lots: 0.0000001 },
    { lots: "1.0000001" },
    { lots: Infinity },
    { lots: "1,25" },
    { lots: "1e2" },
    { lots: true },
    { price: 0 },
    { price: 1.00001 },
    { price: "8500.12345" },
    { price: 0.00001 },
    { price: NaN },
    { fees: -1 },
    { accountId: true },
    { date: "2026-10-04" },
    { date: "2026-02-30" },
    { side: "transfer" },
    { side: "sell", fees: 99999999 },
  ])("rejects invalid trades: %s", (override) => {
    expect(() => parseStockTrade({ ...trade, ...override })).toThrow(
      "invalidInput",
    )
  })
  it.each([
    ["1.25", "8500.75", 125],
    [0.003, 10.25, 0.3],
    [0.000001, 100, 0.0001],
    ["1.2500000", "8500.750", 125],
    [1.25, "8500.1234", 125],
    [1, "1.0001", 100],
    [1, "0.0001", 100],
    [1, "1000000000.0000", 100],
    [1, "8500.123400", 100],
  ])("accepts decimal lots and prices: %s, %s", (lots, price, shares) => {
    expect(parseStockTrade({ ...trade, lots, price })).toMatchObject({
      shares,
      price: Number(price),
    })
  })
  it("rejects trades that round to zero gross value", () => {
    expect(() =>
      parseStockTrade({ ...trade, lots: 0.000001, price: 0.01, fees: 0 }),
    ).toThrow("invalidInput")
  })
  it("rejects an overflowing trade amount", () => {
    expect(() =>
      parseStockTrade({ ...trade, lots: 100000, price: 1000000000 }),
    ).toThrow("invalidInput")
  })
  it("validates fund targets, accounts, and future deadlines", () => {
    expect(
      parseFund({
        name: "Car tax",
        accountId: "1",
        targetAmount: "1200000",
        targetDate: "2027-01-01",
      }),
    ).toMatchObject({ targetAmount: 1200000, description: "" })
    expect(() =>
      parseFund({
        name: "Car tax",
        accountId: 1,
        targetAmount: 1200000,
        targetDate: "2026-10-02",
      }),
    ).toThrow("invalidInput")
  })
  it("limits calculator dates and validates planned expenses", () => {
    expect(
      parseSimulation({
        endDate: "2026-11-30",
        extraIncomes: [
          { name: "Bonus", amount: "100000", date: "2026-10-10" },
        ],
        extraExpenses: [
          { name: "Phone", amount: "500000", date: "2026-10-10" },
        ],
      }),
    ).toMatchObject({
      extraIncomes: [{ name: "Bonus", amount: 100000, date: "2026-10-10" }],
      extraExpenses: [{ name: "Phone", amount: 500000, date: "2026-10-10" }],
    })
    expect(() =>
      parseSimulation({
        endDate: "2036-01-01",
        extraIncomes: [],
        extraExpenses: [],
      }),
    ).toThrow("invalidInput")
    expect(() =>
      parseSimulation({
        endDate: "2026-10-31",
        extraIncomes: [],
        extraExpenses: [
          { name: "Phone", amount: 500000, date: "2026-11-01" },
        ],
      }),
    ).toThrow("invalidInput")
  })
})
