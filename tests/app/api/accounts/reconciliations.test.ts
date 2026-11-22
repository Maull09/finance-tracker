import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { accounts, reconciliations, stockTrades } from "@/db/schema"

const state = vi.hoisted(() => ({
  select: vi.fn(), from: vi.fn(), where: vi.fn(), insert: vi.fn(), values: vi.fn(), returning: vi.fn(),
  account: { id: 1, initialBalance: 1031000 } as { id: number; initialBalance: number } | undefined,
  trades: [] as object[],
}))
vi.mock("@/lib/server/authenticated-response", () => ({
  authenticatedResponse: async (action: (db: typeof state) => Promise<Response>) => {
    const { financeResponse } = await import("@/lib/api-response")
    return financeResponse(() => action(state))
  },
}))
import { GET, POST } from "@/app/api/accounts/[id]/reconciliations/route"

function post(actualBalance: unknown, extra = {}, id = "1") {
  return POST(new NextRequest("http://localhost/api/accounts/" + id + "/reconciliations", {
    method: "POST", body: JSON.stringify({ actualBalance, date: "2026-11-22", ...extra }),
  }), { params: Promise.resolve({ id }) })
}

describe("decimal account reconciliation", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.account = { id: 1, initialBalance: 1031000 }
    state.trades = []
    state.select.mockReturnValue(state)
    state.from.mockImplementation((table) => ({ where: () => Promise.resolve(
      table === accounts ? state.account ? [state.account] : [] :
      table === stockTrades ? state.trades : [{ type: "income", amount: 225.23, accountId: 1 }],
    ) }))
    state.insert.mockReturnValue(state)
    state.values.mockReturnValue(state)
    state.returning.mockImplementation(async () => [{ id: 1, ...state.values.mock.lastCall![0] }])
  })
  it.each(["594585,79", "594585.79", 594585.79])("preserves cents and stores only a comparison for %s", async (actual) => {
    const response = await post(actual)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ actualBalance: 594585.79, recordedBalance: 1031225.23, difference: -436639.44 })
    expect(state.insert).toHaveBeenCalledExactlyOnceWith(reconciliations)
    expect(state.values).toHaveBeenCalledWith({ accountId: 1, actualBalance: 594585.79, date: "2026-11-22", note: "" })
    expect(state.account?.initialBalance).toBe(1031000)
  })
  it.each([0, "0,00", "-594585,79", -2_147_483_648, 2_147_483_647])("retains valid zero, negative and boundary balances: %s", async (actual) => {
    expect((await post(actual)).status).toBe(201)
  })
  it("compares equal fractional balances exactly, including stock cash changes", async () => {
    state.trades = [{ side: "sell", shares: 1, price: 0.1, fees: 0 }, { side: "sell", shares: 1, price: 0.2, fees: 0 }]
    expect(await (await post("1031225,53")).json()).toMatchObject({ recordedBalance: 1031225.53, difference: 0 })
  })
  it.each([undefined, null, true, {}, [], "", " ", "NaN", "1e3", "1.234", "1,234", "594.585,79", "2147483647.01", "-2147483648.01"])("rejects invalid input without reading or writing financial data: %s", async (actual) => {
    expect((await post(actual)).status).toBe(400)
    expect(state.select).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("rejects an invalid date before writing", async () => {
    expect((await post("594585,79", { date: "2026-02-30" })).status).toBe(400)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it.each(["0", "1.1", "abc", "2147483648"])("rejects invalid account IDs for reads and writes: %s", async (id) => {
    expect((await post("594585,79", {}, id)).status).toBe(400)
    expect((await GET(new NextRequest("http://localhost/api/accounts/" + id + "/reconciliations"), { params: Promise.resolve({ id }) })).status).toBe(400)
    expect(state.select).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("does not write when the account is absent from the authenticated user's database scope", async () => {
    state.account = undefined
    expect((await post("594585,79")).status).toBe(404)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it.each([null, [], "bad"])("rejects malformed request bodies: %s", async (body) => {
    const response = await POST(new NextRequest("http://localhost/api/accounts/1/reconciliations", {
      method: "POST", body: JSON.stringify(body),
    }), { params: Promise.resolve({ id: "1" }) })
    expect(response.status).toBe(400)
    expect(state.insert).not.toHaveBeenCalled()
  })
})
