// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { messages } from "@/lib/i18n"
import { formatCurrency } from "@/lib/finance"

const mocks = vi.hoisted(() => ({ request: vi.fn(), locale: "id" as "en" | "id" }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: (url: string) => ({
  data: url === "/api/valued-accounts" ? { accounts: [], totals: { knownValue: 0, unpricedCount: 0, staleCount: 0 } } : [{ id: 1, name: "Mandiri", type: "bank", balance: 1031225.23, initialBalance: 1031000 }],
  loading: false, error: "", reload: vi.fn(),
}) }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({
  locale: mocks.locale,
  t: (key: string, values: Record<string, string> = {}) => Object.entries(values).reduce(
    (text, [name, value]) => text.replace("{" + name + "}", value), messages[mocks.locale][key] ?? key,
  ),
  formatCurrency: (amount: number) => formatCurrency(amount, mocks.locale),
}) }))
import { AccountSummary } from "@/components/account-summary"
import { FeedbackProvider } from "@/components/feedback"

describe("reconciliation decimal balance field", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.locale = "id"
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove() })
  async function open() {
    await act(async () => root.render(<FeedbackProvider><AccountSummary /></FeedbackProvider>))
    const trigger = [...container.querySelectorAll("button")].find((button) => button.textContent === messages[mocks.locale].reconcileBalance)!
    await act(async () => trigger.click())
    return document.querySelector<HTMLElement>('[role="dialog"]')!
  }
  async function fill(dialog: HTMLElement, value: string) {
    const input = dialog.querySelector<HTMLInputElement>("input")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  async function submit(dialog: HTMLElement) {
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  }
  it.each(["id", "en"] as const)("previews decimal commas and submits normalized cents in %s", async (locale) => {
    mocks.locale = locale
    mocks.request.mockResolvedValue({ difference: -436639.44 })
    const dialog = await open()
    const input = await fill(dialog, "594585,79")
    expect(input.type).toBe("text")
    expect(input.inputMode).toBe("decimal")
    expect(input.checkValidity()).toBe(true)
    expect(dialog.textContent).toContain(messages[locale].actualBalanceHint)
    expect(dialog.textContent).toContain(formatCurrency(594585.79, locale))
    await submit(dialog)
    expect(mocks.request.mock.calls[0][0]).toBe("/api/accounts/1/reconciliations")
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toMatchObject({ actualBalance: 594585.79 })
    expect(dialog.textContent).toContain(formatCurrency(-436639.44, locale))
    expect(dialog.textContent).toContain(formatCurrency(1031225.23, locale))
  })
  it.each(["0", "-594585,79", "594585.79"])("allows zero, negative and dot balances: %s", async (value) => {
    mocks.request.mockResolvedValue({ difference: 0 })
    const dialog = await open()
    const input = await fill(dialog, value)
    expect(input.checkValidity()).toBe(true)
    await submit(dialog)
    expect(mocks.request).toHaveBeenCalledOnce()
  })
  it.each(["", "594585,791", "594.585,79", "NaN"])("prevents invalid balances from saving: %s", async (value) => {
    const dialog = await open()
    await fill(dialog, value)
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
    await submit(dialog)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("retains the entered comma and preview after failure", async () => {
    mocks.request.mockRejectedValue(new Error("invalidInput"))
    const dialog = await open()
    const input = await fill(dialog, "594585,79")
    await submit(dialog)
    expect(input.value).toBe("594585,79")
    expect(dialog.textContent).toContain(formatCurrency(594585.79, "id"))
    expect(dialog.querySelector('[role="alert"]')).not.toBeNull()
  })
})
