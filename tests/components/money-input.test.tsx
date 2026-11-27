// @vitest-environment jsdom
import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MoneyInput } from "@/components/money-input"
import { Field } from "@/components/feedback"
import { formatCurrency } from "@/lib/finance"
import { messages } from "@/lib/i18n"

const state = vi.hoisted(() => ({ locale: "id" as "id" | "en" }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({
  t: (key: string) => messages[state.locale][key] ?? key,
  formatCurrency: (amount: number) => formatCurrency(amount, state.locale),
}) }))

function Form({ min, max }: { min?: string; max?: number }) {
  const [value, setValue] = useState("")
  return <form><Field id="amount" label="Amount" hint="Existing hint" required>
    <MoneyInput id="amount" aria-describedby="amount-hint" min={min} max={max} value={value} required onChange={(event) => setValue(event.target.value)} />
  </Field></form>
}

describe("shared money input", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state.locale = "id"
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove() })
  async function mount(min?: string, max?: number) {
    await act(async () => root.render(<Form min={min} max={max} />))
    return container.querySelector("input")!
  }
  async function fill(input: HTMLInputElement, value: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
  }
  it.each(["id", "en"] as const)("preserves comma input, keyboard, localized preview and hint associations in %s", async (locale) => {
    state.locale = locale
    const input = await mount()
    await fill(input, "594585,79")
    expect(input.value).toBe("594585,79")
    expect(input.inputMode).toBe("decimal")
    expect(input.checkValidity()).toBe(true)
    expect(container.textContent).toContain(formatCurrency(594585.79, locale))
    expect(container.textContent).toContain(messages[locale].moneyAmountHint)
    for (const id of input.getAttribute("aria-describedby")!.split(" ")) expect(document.getElementById(id)).not.toBeNull()
  })
  it.each(["", "0", "-1", "594585,791", "594.585,79", "1e3", "2147483647.01"])("blocks invalid or out-of-range input: %s", async (value) => {
    const input = await mount()
    await fill(input, value)
    expect(container.querySelector("form")!.checkValidity()).toBe(false)
    expect(input.value).toBe(value)
  })
  it("supports zero fees and signed balances while keeping precision limits", async () => {
    const input = await mount("-2147483648")
    for (const value of ["0", "-594585,79", "0.01", "2147483647"]) {
      await fill(input, value)
      expect(input.checkValidity()).toBe(true)
    }
    await fill(input, "-2147483648.01")
    expect(input.checkValidity()).toBe(false)
  })
  it("enforces fractional payment limits exactly", async () => {
    const input = await mount("0.01", 0.2)
    await fill(input, "0,20")
    expect(input.checkValidity()).toBe(true)
    await fill(input, "0,21")
    expect(input.checkValidity()).toBe(false)
  })
})
