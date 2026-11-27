import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { valuedAccountBalances, valuedAccounts } from "@/db/schema"

const state = vi.hoisted(() => ({ transaction: vi.fn(), insert: vi.fn(), values: vi.fn(), returning: vi.fn(), select: vi.fn(), from: vi.fn(), where: vi.fn(), for: vi.fn(), update: vi.fn(), set: vi.fn(), delete: vi.fn(), assets: vi.fn(), history: vi.fn() }))
vi.mock("@/lib/server/authenticated-response", () => ({ authenticatedResponse: async (action: (db: typeof state) => Promise<Response>) => {
  const { financeResponse } = await import("@/lib/api-response")
  return financeResponse(() => action(state))
} }))
vi.mock("@/lib/server/valued-assets", () => ({ readValuedAssets: state.assets, readValuedAccountHistory: state.history }))
import { GET, POST } from "@/app/api/valued-accounts/route"
import { GET as history, PATCH, DELETE } from "@/app/api/valued-accounts/[id]/route"

const input = { name: "Gold", symbol: "XAU", quantity: "1,234567", date: "2026-11-27" }
const context = { params: Promise.resolve({ id: "1" }) }
function request(body: unknown, method = "POST") { return new Request("http://localhost/api/valued-accounts", { method, body: JSON.stringify(body) }) }

describe("native asset account API", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-27T10:00:00Z"))
    for (const method of ["insert", "values", "select", "from", "update", "set", "delete"] as const) state[method].mockReturnValue(state)
    state.transaction.mockImplementation((action) => action(state))
    state.for.mockResolvedValue([{ id: 1, symbol: "XAU" }])
    state.where.mockReturnValue(state)
    state.returning.mockResolvedValue([{ id: 1, symbol: "XAU" }])
    state.assets.mockResolvedValue({ accounts: [], totals: { knownValue: 0 } })
    state.history.mockResolvedValue([{ quantity: 1.234567, date: "2026-11-27" }])
  })
  afterEach(() => vi.useRealTimers())
  it("creates only the owned account and its original-unit snapshot, ignoring supplied owners or rates", async () => {
    const response = await POST(request({ ...input, userId: "wrong", rate: 1, marketValue: 999 }))
    expect(response.status).toBe(201)
    expect(state.insert.mock.calls.map(([table]) => table)).toEqual([valuedAccounts, valuedAccountBalances])
    expect(state.values.mock.calls).toEqual([[{ name: "Gold", symbol: "XAU", description: "" }], [{ accountId: 1, quantity: 1.234567, date: "2026-11-27" }]])
    expect(state.transaction).toHaveBeenCalledOnce()
  })
  it.each([{ ...input, symbol: "USD", quantity: "0,01" }, { ...input, symbol: "JPY", quantity: "100" }, { ...input, quantity: 0 }])("accepts supported native balances: %s", async (body) => {
    expect((await POST(request(body))).status).toBe(201)
  })
  it.each([null, [], { ...input, symbol: "BTC" }, { ...input, quantity: "1.2345678" }, { ...input, symbol: "JPY", quantity: "1.5" }, { ...input, quantity: -1 }, { ...input, date: "2099-01-01" }])("rejects invalid native records before writing: %s", async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("appends a snapshot under a locked account instead of changing old quantities", async () => {
    expect((await PATCH(request(input, "PATCH"), context)).status).toBe(200)
    expect(state.for).toHaveBeenCalledWith("update")
    expect(state.update).toHaveBeenCalledExactlyOnceWith(valuedAccounts)
    expect(state.set).toHaveBeenCalledWith({ name: "Gold", description: "" })
    expect(state.insert).toHaveBeenCalledExactlyOnceWith(valuedAccountBalances)
  })
  it("prevents changing the unit or currency of recorded history", async () => {
    expect((await PATCH(request({ ...input, symbol: "USD", quantity: "1.23" }, "PATCH"), context)).status).toBe(409)
    expect(state.insert).not.toHaveBeenCalled(); expect(state.update).not.toHaveBeenCalled()
  })
  it("returns only the authenticated user's valued summary", async () => {
    expect((await GET(new Request("http://localhost/api/valued-accounts"))).status).toBe(200)
    expect(state.assets).toHaveBeenCalledWith(state)
  })
  it("does not expose another account's history", async () => {
    state.where.mockResolvedValue([])
    expect((await history(new Request("http://localhost/api/valued-accounts/1"), context)).status).toBe(404)
    expect(state.history).not.toHaveBeenCalled()
  })
  it.each(["0", "1.5", "abc"])("rejects invalid IDs for edits and deletes: %s", async (id) => {
    const params = { params: Promise.resolve({ id }) }
    expect((await PATCH(request(input, "PATCH"), params)).status).toBe(400)
    expect((await DELETE(new Request("http://localhost/api/valued-accounts/" + id, { method: "DELETE" }), params)).status).toBe(400)
    expect(state.insert).not.toHaveBeenCalled()
  })
})
