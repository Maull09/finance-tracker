// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { messages } from "@/lib/i18n"
import { formatCurrency } from "@/lib/finance"

const mocks = vi.hoisted(() => ({ request: vi.fn(), saved: vi.fn(), locale: "id" as "en" | "id" }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: () => ({ data: [], loading: false, error: "", reload: vi.fn() }) }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({
  t: (key: string) => messages[mocks.locale][key] ?? key,
  formatCurrency: (amount: number) => formatCurrency(amount, mocks.locale),
}) }))
import { TransactionForm } from "@/components/transaction-form"

const transaction = { id: 1, type: "expense" as const, amount: 100000, category: "Minuman", subcategory: "Kopi", groupName: null,
  description: null, date: "2026-11-22", accountId: 1, destinationAccountId: null }

describe("transaction decimal amount field", () => {
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
  async function open(amount = 100000) {
    await act(async () => root.render(<TransactionForm transaction={{ ...transaction, amount }}
      accounts={[{ id: 1, name: "Bank", type: "bank", initialBalance: 1000000, description: null }]} onSaved={mocks.saved} />))
    await act(async () => container.querySelector("button")!.click())
    return document.querySelector<HTMLElement>('[role="dialog"]')!
  }
  async function fill(dialog: HTMLElement, value: string) {
    const input = dialog.querySelector<HTMLInputElement>('input[id$="-amount"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    return input
  }
  async function submit(dialog: HTMLElement) {
    await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  }
  it.each(["id", "en"] as const)("accepts a decimal comma and preserves it in the save payload in %s", async (locale) => {
    mocks.locale = locale
    mocks.request.mockResolvedValue({ id: 1 })
    const dialog = await open()
    const input = await fill(dialog, "243060,44")
    expect(input.inputMode).toBe("decimal")
    expect(dialog.textContent).toContain(messages[locale].transactionAmountHint)
    expect(dialog.textContent).toContain(formatCurrency(243060.44, locale))
    await submit(dialog)
    expect(mocks.request.mock.calls[0][0]).toBe("/api/transactions/1")
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toMatchObject({ amount: 243060.44 })
  })
  it("prefills saved fractional amounts without losing cents", async () => {
    const dialog = await open(243060.44)
    expect(dialog.querySelector<HTMLInputElement>('input[id$="-amount"]')!.value).toBe("243060.44")
  })
  it.each(["0", "-1", "243060,444", "243.060,44"])("rejects invalid input without saving: %s", async (amount) => {
    const dialog = await open()
    await fill(dialog, amount)
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
    await submit(dialog)
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("keeps the decimal comma and preview after a save failure", async () => {
    mocks.request.mockRejectedValue(new Error("networkError"))
    const dialog = await open()
    const input = await fill(dialog, "243060,44")
    await submit(dialog)
    expect(input.value).toBe("243060,44")
    expect(dialog.textContent).toContain(formatCurrency(243060.44, "id"))
    expect(mocks.saved).not.toHaveBeenCalled()
  })
})
