// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { messages } from "@/lib/i18n"
import { formatCurrency, formatDate } from "@/lib/finance"
import { ValuedAccounts } from "@/components/valued-accounts"
import { FeedbackProvider } from "@/components/feedback"
import type { ValuedAccount } from "@/lib/valued-assets"

const state = vi.hoisted(() => ({ request: vi.fn(), remote: vi.fn(), locale: "id" as "id" | "en" }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: state.request }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: state.remote }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ locale: state.locale,
  t: (key: string, values: Record<string, string | number> = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll("{" + name + "}", String(value)), messages[state.locale][key] ?? key),
  formatCurrency: (amount: number) => formatCurrency(amount, state.locale), formatDate: (date: string) => formatDate(date, state.locale),
}) }))
const usd: ValuedAccount = { id: 1, name: "USD cash", symbol: "USD", quantity: 100.25, balanceDate: "2026-11-27", description: "",
  marketValue: 1604000, stale: false, rate: { symbol: "USD", idrRate: 16000, date: "2026-11-27", observedAt: "2026-11-27T00:00:00Z", oldestInputAt: "2026-11-27T00:00:00Z", expiresAt: "2026-11-28T00:00:00Z", source: "ExchangeRate-API" } }

describe("gold and foreign-currency accounts", () => {
  let root: Root; let container: HTMLDivElement
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-27T10:00:00Z"))
    state.locale = "id"
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state.remote.mockReturnValue({ data: { accounts: [usd], totals: { knownValue: 1604000, unpricedCount: 0, staleCount: 0 } }, loading: false, error: "", reload: vi.fn() })
    container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers() })
  async function mount() { await act(async () => root.render(<FeedbackProvider><ValuedAccounts /></FeedbackProvider>)) }
  async function open(key: string) {
    await mount(); const trigger = [...container.querySelectorAll("button")].find((button) => button.textContent === messages[state.locale][key])!
    await act(async () => trigger.click()); return document.querySelector<HTMLElement>('[role="dialog"]')!
  }
  async function fill(dialog: HTMLElement, suffix: string, value: string) {
    const input = dialog.querySelector<HTMLInputElement>('input[id$="-' + suffix + '"]')!
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })) })
    return input
  }
  async function submit(dialog: HTMLElement) { await act(async () => dialog.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
  it.each(["id", "en"] as const)("shows original currency, estimated rupiah, sources and quote date in %s", async (locale) => {
    state.locale = locale; await mount()
    expect(container.textContent).toContain("USD")
    expect(container.textContent).toContain(formatCurrency(1604000, locale))
    expect(container.textContent).toContain(messages[locale].assetReferenceHint)
    expect(container.querySelector('a[href="https://www.exchangerate-api.com"]')).not.toBeNull()
  })
  it("creates a six-decimal gold balance without submitting an IDR transaction", async () => {
    state.request.mockResolvedValue({ id: 2 })
    const dialog = await open("addValuedAccount"); await fill(dialog, "name", "Gold"); await fill(dialog, "quantity", "1,234567"); await submit(dialog)
    expect(state.request.mock.calls[0][0]).toBe("/api/valued-accounts")
    expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({ symbol: "XAU", quantity: "1,234567", date: "2026-11-27" })
  })
  it.each(["id", "en"] as const)("shows and saves a fractional Thai baht balance in %s", async (locale) => {
    state.locale = locale
    state.remote.mockReturnValue({ data: { accounts: [{ ...usd, name: "Thai baht", symbol: "THB", marketValue: 50125,
      rate: { ...usd.rate, symbol: "THB", idrRate: 500 } }], totals: { knownValue: 50125, unpricedCount: 0, staleCount: 0 } }, loading: false, error: "", reload: vi.fn() })
    state.request.mockResolvedValue({ id: 1 })
    const dialog = await open("editAssetBalance")
    expect(container.textContent).toContain("THB")
    expect(container.textContent).toContain(formatCurrency(50125, locale))
    await fill(dialog, "quantity", "1000,79"); await submit(dialog)
    expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({ symbol: "THB", quantity: "1000,79" })
  })
  it("appends a fractional FX balance and retains it after failure", async () => {
    state.request.mockRejectedValue(new Error("serviceUnavailable"))
    const dialog = await open("editAssetBalance"); const input = await fill(dialog, "quantity", "200,75"); await submit(dialog)
    expect(state.request.mock.calls[0][0]).toBe("/api/valued-accounts/1")
    expect(JSON.parse(state.request.mock.calls[0][1].body)).toMatchObject({ symbol: "USD", quantity: "200,75" })
    expect(input.value).toBe("200,75")
    expect(dialog.querySelector('[role="alert"]')).not.toBeNull()
  })
  it.each(["", "-1", "1.000,25", "1.234", "1000000.01"])("prevents invalid FX quantities from saving: %s", async (value) => {
    const dialog = await open("editAssetBalance"); await fill(dialog, "quantity", value)
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
    await submit(dialog); expect(state.request).not.toHaveBeenCalled()
  })
  it("marks an unpriced balance and the subtotal incomplete instead of inventing a zero valuation", async () => {
    state.remote.mockReturnValue({ data: { accounts: [{ ...usd, rate: null, marketValue: null }], totals: { knownValue: 0, unpricedCount: 1, staleCount: 0 } }, loading: false, error: "", reload: vi.fn() })
    await mount(); expect(container.textContent).toContain(messages.id.assetQuotesIncomplete); expect(container.textContent).toContain(messages.id.unpriced)
  })
  it("retries the price provider after a failed manual refresh", async () => {
    state.request.mockResolvedValueOnce({ updated: 0, failures: [{ code: "assetRatesUnavailable" }] })
      .mockResolvedValueOnce({ updated: 1, failures: [] })
    await mount()
    const refresh = [...container.querySelectorAll("button")].find((button) => button.textContent === messages.id.refreshAssetRates)!
    await act(async () => refresh.click())
    const retry = container.querySelector<HTMLButtonElement>('[role="alert"] button')!
    await act(async () => retry.click())
    expect(state.request).toHaveBeenCalledTimes(2)
    expect(state.request.mock.calls[1][0]).toBe("/api/asset-rates/refresh")
    expect(container.textContent).toContain(messages.id.assetRatesUpdated)
  })
})
