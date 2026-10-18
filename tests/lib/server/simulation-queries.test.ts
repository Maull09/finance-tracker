import { beforeEach, describe, expect, it, vi } from "vitest"
import { readSimulationBalance } from "@/lib/server/simulation-queries"
import type { ReadConnection } from "@/lib/server/ledger"

const mocks = vi.hoisted(() => ({ ledger: vi.fn(), debts: vi.fn(), prices: vi.fn(), from: vi.fn() }))
vi.mock("@/lib/server/financial-queries", () => ({ readBalanceLedger: mocks.ledger, debtSummaryQuery: mocks.debts }))
vi.mock("@/lib/server/market-queries", () => ({ readLatestPrices: mocks.prices }))
const connection = { select: () => ({ from: mocks.from }) } as unknown as ReadConnection

describe("calculator balance sheet", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.ledger.mockResolvedValue({ cashBalance: 10000000 })
    mocks.debts.mockResolvedValue([
      { type: "utang", remaining: 4000000 },
      { type: "piutang", remaining: 2000000 },
      { type: "utang", remaining: 0 },
    ])
    mocks.from.mockResolvedValue([{ id: 1, accountId: 1, symbol: "BBCA", side: "buy", shares: 100, price: 9000, fees: 0, date: "2026-01-01" }])
    mocks.prices.mockResolvedValue([{ symbol: "BBCA", price: 10000, date: "2026-10-19" }])
  })
  it("combines recorded cash, stock market values, receivables and remaining debts", async () => {
    expect(await readSimulationBalance(connection)).toEqual({ currentBalance: 10000000, knownNetWorth: 9000000, netWorth: 9000000 })
    expect(mocks.ledger).toHaveBeenCalledWith(connection)
    expect(mocks.debts).toHaveBeenCalledWith(connection)
    expect(mocks.prices).toHaveBeenCalledWith(connection, ["BBCA"])
  })
  it("excludes unpriced shares from the subtotal and marks net worth incomplete", async () => {
    mocks.prices.mockResolvedValue([])
    expect(await readSimulationBalance(connection)).toEqual({ currentBalance: 10000000, knownNetWorth: 8000000, netWorth: null })
  })
  it("returns zero for empty records and preserves a negative balance sheet", async () => {
    mocks.ledger.mockResolvedValue({ cashBalance: 0 })
    mocks.from.mockResolvedValue([])
    mocks.debts.mockResolvedValue([])
    expect(await readSimulationBalance(connection)).toEqual({ currentBalance: 0, knownNetWorth: 0, netWorth: 0 })
    mocks.debts.mockResolvedValue([{ type: "utang", remaining: 4000000 }])
    expect(await readSimulationBalance(connection)).toMatchObject({ netWorth: -4000000 })
  })
})
