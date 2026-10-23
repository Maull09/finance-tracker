import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { getToday } from "@/lib/finance"

const state = vi.hoisted(() => ({
  transaction: vi.fn(), select: vi.fn(), from: vi.fn(), where: vi.fn(), for: vi.fn(),
  insert: vi.fn(), values: vi.fn(), returning: vi.fn(), update: vi.fn(), set: vi.fn(),
}))
vi.mock("@/lib/server/authenticated-response", () => ({
  authenticatedResponse: async (action: (db: typeof state) => Promise<Response>) => action(state),
}))
import { POST } from "@/app/api/recurring/[id]/execute/route"

describe("recurring transaction categorization", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    state.transaction.mockImplementation((action) => action(state))
    for (const method of ["select", "from", "where", "insert", "values", "update", "set"] as const)
      state[method].mockReturnValue(state)
    state.returning.mockResolvedValue([{ id: 2 }])
  })
  it.each(["Kopi", null])("preserves optional subcategory %s when recording an occurrence", async (subcategory) => {
    state.for.mockResolvedValue([{
      id: 1, type: "expense", amount: 25000, category: "Minuman", subcategory,
      accountId: 1, destinationAccountId: null, startDate: getToday(), endDate: null,
      lastExecutedDate: null, description: "Coffee",
    }])
    const response = await POST(new NextRequest("http://localhost/api/recurring/1/execute", { method: "POST" }), { params: Promise.resolve({ id: "1" }) })
    expect(response.status).toBe(201)
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ category: "Minuman", subcategory, amount: 25000 }))
  })
})
