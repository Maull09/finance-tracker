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
  it("uses stock purchase costs for gross worth and market values for net worth", async () => {
    expect(await readSimulationBalance(connection)).toEqual({ currentBalance: 10000000,
      grossWorth: 12900000, knownNetWorth: 9000000, netWorth: 9000000 })
    expect(mocks.ledger).toHaveBeenCalledWith(connection)
    expect(mocks.debts).toHaveBeenCalledWith(connection)
    expect(mocks.prices).toHaveBeenCalledWith(connection, ["BBCA"])
  })
  it("keeps stock purchase costs in gross worth when market prices are missing", async () => {
    mocks.prices.mockResolvedValue([])
    expect(await readSimulationBalance(connection)).toEqual({ currentBalance: 10000000,
      grossWorth: 12900000, knownNetWorth: 8000000, netWorth: null })
  })
  it("returns zero for empty records and preserves a negative balance sheet", async () => {
    mocks.ledger.mockResolvedValue({ cashBalance: 0 })
    mocks.from.mockResolvedValue([])
    mocks.debts.mockResolvedValue([])
    expect(await readSimulationBalance(connection)).toEqual({ currentBalance: 0,
      grossWorth: 0, knownNetWorth: 0, netWorth: 0 })
    mocks.debts.mockResolvedValue([{ type: "utang", remaining: 4000000 }])
    expect(await readSimulationBalance(connection)).toMatchObject({ grossWorth: 0, netWorth: -4000000 })
  })
  it("keeps gross worth unchanged when outstanding debts increase", async () => {
    const before = await readSimulationBalance(connection)
    mocks.debts.mockResolvedValue([{ type: "utang", remaining: 6000000 }, { type: "piutang", remaining: 2000000 }])
    const after = await readSimulationBalance(connection)
    expect(after.grossWorth).toBe(before.grossWorth)
    expect(after.netWorth).toBe(before.netWorth! - 2000000)
  })
  it("keeps gross worth fixed when stock market prices change", async () => {
    const before = await readSimulationBalance(connection)
    mocks.prices.mockResolvedValue([{ symbol: "BBCA", price: 20000, date: "2026-10-19" }])
    const after = await readSimulationBalance(connection)
    expect(after.grossWorth).toBe(before.grossWorth)
    expect(after.netWorth).toBe(10000000)
  })
  it("includes buy fees only for the shares still held and removes fully sold positions", async () => {
    const buy = { id: 1, accountId: 1, symbol: "BBCA", side: "buy", shares: 100, price: 9000, fees: 10000, date: "2026-01-01" }
    const sale = { ...buy, id: 2, side: "sell", shares: 50, price: 12000, fees: 5000, date: "2026-02-01" }
    mocks.from.mockResolvedValue([buy, sale])
    expect(await readSimulationBalance(connection)).toMatchObject({ grossWorth: 12455000, netWorth: 8500000 })
    mocks.from.mockResolvedValue([buy, sale, { ...sale, id: 3, date: "2026-03-01" }])
    expect(await readSimulationBalance(connection)).toMatchObject({ grossWorth: 12000000, netWorth: 8000000 })
  })
})
