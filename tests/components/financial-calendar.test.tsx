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
import { FinancialCalendar } from "@/components/financial-calendar"

describe("recording early or late from the financial calendar", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-23T05:00:00Z"))
    mocks.locale = "en"
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.remote.mockReturnValue({ data: { month: "2026-10", events: [
      { id: "schedule-1-2026-10-31", scheduleId: 1, name: "Early rent", type: "expense", amount: 1000000, date: "2026-10-31", source: "recurring", accountName: "Bank" },
      { id: "schedule-2-2026-10-01", scheduleId: 2, name: "Late salary", type: "income", amount: 5000000, date: "2026-10-01", source: "recurring" },
      { id: "debt-1", name: "Loan due", type: "debtDue", amount: 500000, date: "2026-10-10", source: "debts" },
    ] }, loading: false, refreshing: false, error: "", reload: vi.fn() })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  async function open(name = "Early rent") {
    await act(async () => root.render(<AiAvailabilityProvider value={{ assistantEnabled: false, insightsEnabled: false }}><FinancialCalendar /></AiAvailabilityProvider>))
    const item = [...container.querySelectorAll("li")].find((row) => row.textContent?.includes(name))!
    await act(async () => item.querySelector<HTMLButtonElement>("button")!.click())
    return document.querySelector<HTMLElement>('[role="dialog"]')!
  }
  async function setDate(dialog: HTMLElement, value: string) {
    const input = dialog.querySelector<HTMLInputElement>('input[type="date"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  async function setAmount(dialog: HTMLElement, value: string) {
    const input = dialog.querySelector<HTMLInputElement>('input[type="number"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  it.each(["en", "id"] as const)("offers early and late recording in %s without a payment action on debt reminders", async (locale) => {
    mocks.locale = locale
    const dialog = await open()
    expect(dialog.textContent).toContain(messages[locale].recordOccurrenceHint)
    expect(dialog.textContent).toContain(messages[locale].actualTransactionDate)
    expect(dialog.textContent).toContain(messages[locale].scheduledAmount)
    expect(dialog.textContent).toContain(messages[locale].actualTransactionAmount)
    expect(dialog.textContent).toContain(messages[locale].actualTransactionAmountHint)
    expect(dialog.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("1000000")
    expect(dialog.textContent).toContain("Bank")
    expect(dialog.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe("2026-10-23")
    expect(dialog.querySelectorAll('input[type="date"]')).toHaveLength(1)
    const debt = [...container.querySelectorAll("li")].find((row) => row.textContent?.includes("Loan due"))!
    expect(debt.querySelector("button")).toBeNull()
  })
  it("submits a future scheduled occurrence with the selected actual date and amount", async () => {
    mocks.request.mockResolvedValue({ id: 1 })
    const dialog = await open()
    await setDate(dialog, "2026-10-20")
    await setAmount(dialog, "750000")
    expect(dialog.textContent).toContain(formatCurrency(750000))
    expect(dialog.textContent).toContain(formatCurrency(1000000))
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    const [url, request] = mocks.request.mock.calls[0]
    expect(url).toBe("/api/recurring/1/execute")
    expect(JSON.parse(request.body)).toEqual({ scheduledDate: "2026-10-31", date: "2026-10-20", amount: 750000 })
  })
  it("keeps the actual date and selected occurrence after a failed late recording", async () => {
    mocks.request.mockRejectedValue(new Error("scheduleAlreadyRecorded"))
    const dialog = await open("Late salary")
    const input = await setDate(dialog, "2026-10-22")
    const amount = await setAmount(dialog, "5500000")
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(dialog.textContent).toContain(messages.en.scheduleAlreadyRecorded)
    expect(input.value).toBe("2026-10-22")
    expect(amount.value).toBe("5500000")
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ scheduledDate: "2026-10-01", date: "2026-10-22", amount: 5500000 })
  })
  it.each(["", "0", "-1", "1.5", "2147483648"])("prevents invalid actual amount %s from creating a transaction", async (amount) => {
    const dialog = await open()
    await setAmount(dialog, amount)
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("prevents future actual dates from creating a transaction", async () => {
    const dialog = await open()
    await setDate(dialog, "2026-10-24")
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(mocks.request).not.toHaveBeenCalled()
  })
})
