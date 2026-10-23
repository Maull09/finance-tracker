import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), returning: vi.fn(), accountsExist: vi.fn() }))
vi.mock("@/lib/server/authenticated-response", () => ({
  authenticatedResponse: async (action: (db: typeof state) => Promise<Response>) => action(state),
}))
vi.mock("@/lib/accounts", () => ({ accountsExist: state.accountsExist }))
import { POST } from "@/app/api/transactions/route"

const expense = { type: "expense", amount: 25000, category: "Minuman", subcategory: "Kopi", accountId: 1, date: "2026-10-23" }
function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/transactions", { method: "POST", body: JSON.stringify(body) }))
}

describe("transaction category writes", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.insert.mockReturnValue(state)
    state.values.mockReturnValue(state)
    state.returning.mockResolvedValue([{ id: 1, ...expense }])
    state.accountsExist.mockResolvedValue(true)
  })
  it("stores a child separately while retaining the parent and financial amount", async () => {
    const response = await post(expense)
    expect(response.status).toBe(201)
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ category: "Minuman", subcategory: "Kopi", amount: 25000 }))
    expect(await response.json()).toMatchObject({ category: "Minuman", subcategory: "Kopi" })
  })
  it("rejects a mismatched child before querying accounts or writing", async () => {
    expect((await post({ ...expense, subcategory: "Listrik" })).status).toBe(400)
    expect(state.accountsExist).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("retains account ownership checks for categorized transactions", async () => {
    state.accountsExist.mockResolvedValue(false)
    expect((await post(expense)).status).toBe(400)
    expect(state.insert).not.toHaveBeenCalled()
  })
})
