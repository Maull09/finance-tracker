import { describe, expect, it } from "vitest"

import {
  calculateAccountBalance,
  calculateBudgetCarryover,
  calculateForecast,
  getCategoryInsight,
} from "@/lib/calculations"
import { parseTransactionInput } from "@/lib/validation"

describe("financial calculations", () => {
  it("calculates fractional income, expenses and transfers in cents", () => {
    const base = { accountId: 1, destinationAccountId: null, date: "2026-11-22" }
    const transactions = [
      { ...base, type: "income" as const, amount: 0.1 },
      { ...base, type: "income" as const, amount: 0.2 },
      { ...base, type: "expense" as const, amount: 0.3 },
      { ...base, type: "transfer" as const, amount: 0.44, destinationAccountId: 2 },
    ]
    expect(calculateAccountBalance(1, 1, transactions)).toBe(0.56)
    expect(calculateAccountBalance(0, 2, transactions)).toBe(0.44)
  })
  it.each([2147483648, -2147483649, true, [], Infinity])(
    "rejects values outside PostgreSQL integer bounds: %s",
    (amount) => {
      expect(
        parseTransactionInput({
          type: "expense",
          amount,
          category: "Makanan",
          date: "2026-10-03",
          accountId: 1,
        }),
      ).toBeNull()
    },
  )
  it("calculates account balance including a transfer", () => {
    const transactions = [
      {
        type: "income" as const,
        amount: 500_000,
        accountId: 1,
        destinationAccountId: null,
        date: "2026-10-01",
      },
      {
        type: "transfer" as const,
        amount: 100_000,
        accountId: 1,
        destinationAccountId: 2,
        date: "2026-10-02",
      },
    ]

    expect(calculateAccountBalance(50_000, 1, transactions)).toBe(450_000)
    expect(calculateAccountBalance(0, 2, transactions)).toBe(100_000)
  })

  it("carries only unused budget when rollover is enabled", () => {
    expect(calculateBudgetCarryover(500_000, 350_000, true)).toBe(150_000)
    expect(calculateBudgetCarryover(500_000, 600_000, true)).toBe(0)
    expect(calculateBudgetCarryover(500_000, 350_000, false)).toBe(0)
  })

  it("forecasts only cash-changing recurring transactions", () => {
    expect(
      calculateForecast(1_000_000, [
        { type: "income", amount: 5_000_000 },
        { type: "expense", amount: 750_000 },
        { type: "transfer", amount: 200_000 },
      ]),
    ).toBe(5_250_000)
  })

  it("rejects invalid transfer input", () => {
    expect(
      parseTransactionInput({
        type: "transfer",
        amount: 100_000,
        category: "Transfer antar akun",
        date: "2026-10-01",
        accountId: 1,
        destinationAccountId: 1,
      }),
    ).toBeNull()
  })

  it("describes a category change", () => {
    expect(getCategoryInsight("Makanan", 590_000, 500_000)).toBe(
      "Pengeluaran Makanan naik 18% dibanding bulan lalu.",
    )
  })

  it("localizes insights while preserving custom category names", () => {
    expect(getCategoryInsight("Makanan", 590_000, 500_000, "en")).toBe(
      "Food spending increased 18% compared with last month.",
    )
    expect(getCategoryInsight("Pet care", 250_000, 500_000, "en")).toBe(
      "Pet care spending decreased 50% compared with last month.",
    )
  })
})
