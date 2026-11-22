import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { accounts, debtPayments, debts, goalContributions, goals, sinkingFundEntries, sinkingFunds, transactions } from "@/db/schema"

const state = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), update: vi.fn(), set: vi.fn(), values: vi.fn(), returning: vi.fn(),
  summary: vi.fn(), reserved: vi.fn(), transaction: vi.fn(), rows: new Map<unknown, object[]>(),
}))
vi.mock("@/lib/server/authenticated-response", () => ({ authenticatedResponse: async (action: (db: typeof state) => Promise<Response>) => {
  const { financeResponse } = await import("@/lib/api-response")
  return financeResponse(() => action(state))
} }))
vi.mock("@/lib/server/financial-queries", () => ({ accountSummaryQuery: state.summary, readReservedCash: state.reserved }))
import { POST as pay } from "@/app/api/debts/[id]/payments/route"
import { POST as contribute } from "@/app/api/goals/[id]/contributions/route"
import { POST as fundEntry } from "@/app/api/sinking-funds/[id]/entries/route"

function request(body: object) { return new NextRequest("http://localhost/api/fixture", { method: "POST", body: JSON.stringify(body) }) }
const context = { params: Promise.resolve({ id: "1" }) }
describe("decimal financial actions preserve limits and linked records", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.rows.clear()
    state.rows.set(accounts, [{ id: 1 }])
    state.rows.set(debts, [{ id: 1, type: "utang", amount: 0.3, status: "unpaid", name: "Loan" }])
    state.rows.set(debtPayments, [{ amount: 0.1 }])
    state.rows.set(goals, [{ id: 1, currentAmount: 0.1, targetAmount: 0.3 }])
    state.rows.set(goalContributions, [{ amount: 0 }])
    state.rows.set(sinkingFunds, [{ id: 1, accountId: 1, targetAmount: 0.3, name: "Fund" }])
    state.rows.set(sinkingFundEntries, [{ amount: 0.1 }])
    state.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => {
      const rows = Promise.resolve(state.rows.get(table) ?? [])
      return Object.assign(rows, { for: () => rows })
    } }) }))
    state.transaction.mockImplementation((action) => action(state))
    state.insert.mockReturnValue(state)
    state.values.mockReturnValue(state)
    state.returning.mockImplementation(async () => [{ id: 2, ...state.values.mock.lastCall![0] }])
    state.update.mockReturnValue(state)
    state.set.mockReturnValue({ where: vi.fn() })
    state.summary.mockResolvedValue([{ balance: 0.3 }])
    state.reserved.mockResolvedValue({ reserved: new Map([[1, 0.1]]) })
  })
  it("fully pays 0.30 with previous 0.10 plus comma input 0.20 and links the exact transaction", async () => {
    const response = await pay(request({ amount: "0,20", accountId: 1 }), context)
    expect(response.status).toBe(201)
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ amount: 0.2, type: "expense" }))
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ amount: 0.2, transactionId: 2, debtId: 1 }))
    expect(state.set).toHaveBeenCalledWith(expect.objectContaining({ status: "paid" }))
  })
  it("rejects debt overpayment by one cent", async () => {
    expect((await pay(request({ amount: "0,21", accountId: 1 }), context)).status).toBe(409)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("allows exact fractional goal completion without moving account cash", async () => {
    expect((await contribute(request({ amount: "0,20", accountId: 1 }), context)).status).toBe(201)
    expect(state.insert).toHaveBeenCalledExactlyOnceWith(goalContributions)
    expect(state.update).not.toHaveBeenCalled()
  })
  it("rejects a contribution above available fractional cash", async () => {
    state.rows.set(goals, [{ id: 1, currentAmount: 0, targetAmount: 1 }])
    expect((await contribute(request({ amount: "0.21", accountId: 1 }), context)).status).toBe(409)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("allocates the exact remaining fractional fund target without creating a transaction", async () => {
    expect((await fundEntry(request({ amount: "0,20", kind: "allocate" }), context)).status).toBe(201)
    expect(state.insert).toHaveBeenCalledExactlyOnceWith(sinkingFundEntries)
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ amount: 0.2, transactionId: null }))
  })
  it("spends fractional fund money with exactly one linked transaction", async () => {
    expect((await fundEntry(request({ amount: "0,10", kind: "spend", category: "Makanan" }), context)).status).toBe(201)
    expect(state.insert.mock.calls.map(([table]) => table)).toEqual([transactions, sinkingFundEntries])
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ amount: 0.1, transactionId: 2 }))
  })
  it.each([pay, contribute, fundEntry])("rejects a third decimal before reading or writing", async (action) => {
    expect((await action(request({ amount: "0,201", accountId: 1, kind: "allocate" }), context)).status).toBe(400)
    expect(state.select).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
  })
})
