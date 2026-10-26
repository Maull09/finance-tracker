// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AiAvailabilityProvider } from "@/components/ai-availability-provider"
import { messages } from "@/lib/i18n"
import { formatCurrency, formatDate, formatMonth } from "@/lib/finance"

const mocks = vi.hoisted(() => ({ request: vi.fn(), remote: vi.fn(), locale: "en" as "en" | "id" }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: mocks.remote }))
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({
  locale: mocks.locale, t: (key: string) => messages[mocks.locale][key] ?? key,
  formatCurrency, formatDate, formatMonth,
}) }))
import { PlanningManager } from "@/components/planning-manager"

describe("recording all active schedule types", () => {
  let root: Root
  let container: HTMLDivElement
  const baseSchedule = {
    amount: 75000, category: "Tagihan", subcategory: "Internet", accountId: 1,
    startDate: "2026-10-26", endDate: null, frequency: "monthly", destinationAccountId: null,
    description: null, lastExecutedDate: "2026-10-26", recordedThroughDate: null, recordedDates: ["2026-10-26"],
  }
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-26T05:00:00Z"))
    mocks.locale = "en"
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.remote.mockImplementation((url: string) => ({ data: url === "/api/accounts" ? [
      { id: 1, name: "Bank", type: "bank", initialBalance: 1000000, description: null },
      { id: 2, name: "Cash", type: "cash", initialBalance: 0, description: null },
    ] : [
      { ...baseSchedule, id: 1, name: "Internet", type: "expense" },
      { ...baseSchedule, id: 2, name: "Salary", type: "income", category: "Gaji Utama", subcategory: null },
      { ...baseSchedule, id: 3, name: "Weekly transfer", type: "transfer", frequency: "weekly", destinationAccountId: 2, subcategory: null },
      { ...baseSchedule, id: 4, name: "Finished schedule", type: "expense", endDate: "2026-10-26" },
    ], loading: false, refreshing: false, error: "", reload: vi.fn() }))
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  async function mount() {
    await act(async () => root.render(<AiAvailabilityProvider value={{ assistantEnabled: false, insightsEnabled: false }}><PlanningManager /></AiAvailabilityProvider>))
  }
  function recordButton(name: string) {
    const row = [...container.querySelectorAll("li")].find((item) => item.textContent?.includes(name))!
    return [...row.querySelectorAll("button")].find((button) => button.textContent === messages[mocks.locale].recordNow)!
  }
  it.each(["en", "id"] as const)("keeps income, expense and transfer recording available in %s after the current period is recorded", async (locale) => {
    mocks.locale = locale
    await mount()
    for (const [name, date] of [["Internet", "2026-11-26"], ["Salary", "2026-11-26"], ["Weekly transfer", "2026-11-02"]]) {
      const button = recordButton(name)
      expect(button, name).toBeTruthy()
      expect(button.disabled, name).toBe(false)
      await act(async () => button.click())
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
      expect([...dialog.querySelectorAll<HTMLInputElement>('input[type="date"]')].map((input) => input.value))
        .toEqual([date, "2026-10-26"])
      const cancel = [...dialog.querySelectorAll("button")].find((item) => item.textContent === messages[locale].cancel)!
      await act(async () => cancel.click())
    }
    const finished = [...container.querySelectorAll("li")].find((item) => item.textContent?.includes("Finished schedule"))!
    const completed = [...finished.querySelectorAll("button")].find((item) => item.textContent === messages[locale].noPendingOccurrences)!
    expect(completed.disabled).toBe(true)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("records the next period using today's actual date after this period was recorded today", async () => {
    mocks.request.mockResolvedValue({ id: 10 })
    await mount()
    await act(async () => recordButton("Internet").click())
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(mocks.request.mock.calls[0][0]).toBe("/api/recurring/1/execute")
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ scheduledDate: "2026-11-26", date: "2026-10-26", amount: 75000 })
  })
})
