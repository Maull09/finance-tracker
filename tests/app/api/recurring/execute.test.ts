import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { financeResponse } from "@/lib/api-response"

const state = vi.hoisted(() => ({
  select: vi.fn(), from: vi.fn(), where: vi.fn(), for: vi.fn(),
  insert: vi.fn(), values: vi.fn(), returning: vi.fn(), update: vi.fn(), set: vi.fn(), readSchedule: vi.fn(),
}))
vi.mock("@/lib/server/authenticated-response", () => ({
  authenticatedResponse: async (action: (db: typeof state) => Promise<Response>) => financeResponse(() => action(state)),
}))
vi.mock("@/lib/server/recurring-queries", () => ({ recurringSchedulesQuery: () => ({ where: state.readSchedule }) }))
import { POST } from "@/app/api/recurring/[id]/execute/route"

const schedule = {
  id: 1, name: "Coffee", type: "expense", amount: 25000, category: "Minuman", subcategory: "Kopi",
  accountId: 1, destinationAccountId: null, startDate: "2026-09-30", endDate: null,
  frequency: "monthly", lastExecutedDate: null, recordedThroughDate: null, recordedDates: [], description: "Coffee",
}
function record(body: unknown = { scheduledDate: "2026-09-30", date: "2026-10-23", amount: 25000 }) {
  return POST(new NextRequest("http://localhost/api/recurring/1/execute", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "1" }) })
}

describe("recording scheduled occurrences", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-23T05:00:00Z"))
    for (const method of ["select", "from", "where", "insert", "values", "update", "set"] as const)
      state[method].mockReturnValue(state)
    state.for.mockResolvedValue([{ id: 1 }])
    state.readSchedule.mockResolvedValue([{ ...schedule }])
    state.returning.mockResolvedValue([{ id: 2 }])
  })
  afterEach(() => vi.useRealTimers())
  it.each(["Kopi", null])("keeps subcategory %s and stores the actual and scheduled dates separately", async (subcategory) => {
    state.readSchedule.mockResolvedValue([{ ...schedule, subcategory }])
    expect((await record()).status).toBe(201)
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({
      category: "Minuman", subcategory, amount: 25000, recurringId: 1, scheduledDate: "2026-09-30", date: "2026-10-23",
    }))
    expect(state.for).toHaveBeenCalledWith("update")
  })
  it("records before a schedule starts using today's actual date", async () => {
    state.readSchedule.mockResolvedValue([{ ...schedule, startDate: "2026-10-31" }])
    expect((await record({ scheduledDate: "2026-10-31", date: "2026-10-23", amount: 25000 })).status).toBe(201)
  })
  it.each([20000, 30000, 2147483647])("records the actual amount %s without changing the schedule amount", async (amount) => {
    expect((await record({ scheduledDate: "2026-09-30", date: "2026-10-23", amount })).status).toBe(201)
    expect(state.values).toHaveBeenCalledWith(expect.objectContaining({ amount }))
    expect(state.set).toHaveBeenCalledWith({ lastExecutedDate: expect.anything() })
  })
  it.each([undefined, null, "", "abc", "1e3", true, 0, -1, 1.5, 2147483648])("rejects invalid actual amount %s before reading financial data", async (amount) => {
    expect((await record({ scheduledDate: "2026-09-30", date: "2026-10-23", amount })).status).toBe(400)
    expect(state.select).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
  })
  it("records an overdue occurrence after the schedule ends", async () => {
    state.readSchedule.mockResolvedValue([{ ...schedule, endDate: "2026-09-30" }])
    expect((await record()).status).toBe(201)
  })
  it("allows a different occurrence on the same actual date", async () => {
    state.readSchedule.mockResolvedValue([{ ...schedule, lastExecutedDate: "2026-10-23", recordedDates: ["2026-10-30"] }])
    expect((await record()).status).toBe(201)
  })
  it.each([
    { ...schedule, recordedDates: ["2026-09-30"] },
    { ...schedule, recordedThroughDate: "2026-09-30" },
  ])("rejects an already completed occurrence", async (completed) => {
    state.readSchedule.mockResolvedValue([completed])
    const response = await record()
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ code: "scheduleAlreadyRecorded" })
    expect(state.insert).not.toHaveBeenCalled()
  })
  it.each(["2026-10-01", "2026-08-30"])("rejects a non-occurrence date %s", async (scheduledDate) => {
    expect((await record({ scheduledDate, date: "2026-10-23", amount: 25000 })).status).toBe(409)
    expect(state.insert).not.toHaveBeenCalled()
  })
  it.each([{}, { scheduledDate: "2026-09-30", date: "2026-10-24", amount: 25000 }, { scheduledDate: "2026-02-30", date: "2026-10-23", amount: 25000 }])("validates dates before reading financial data", async (body) => {
    expect((await record(body)).status).toBe(400)
    expect(state.select).not.toHaveBeenCalled()
  })
  it("returns missing for a schedule outside the user's records", async () => {
    state.for.mockResolvedValue([])
    expect((await record()).status).toBe(404)
    expect(state.readSchedule).not.toHaveBeenCalled()
    expect(state.insert).not.toHaveBeenCalled()
  })
})
