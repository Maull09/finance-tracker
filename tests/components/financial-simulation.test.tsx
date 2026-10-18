// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FinancialSimulation } from "@/components/financial-simulation"
import { AiAvailabilityProvider } from "@/components/ai-availability-provider"
import { LanguageProvider } from "@/components/language-provider"
import { formatCurrency, getToday } from "@/lib/finance"
import { messages } from "@/lib/i18n"
import { projectNetWorth, simulateCashflow } from "@/lib/planning"

const mocks = vi.hoisted(() => ({ remote: vi.fn(), request: vi.fn() }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: mocks.remote }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ user: { id: "alice" } }) }))

describe("calculator net worth", () => {
  let root: Root
  let container: HTMLDivElement
  const balance = { currentBalance: 1000000, knownGrossWorth: 3000000, grossWorth: 3000000 as number | null,
    knownNetWorth: -2000000, netWorth: -2000000 as number | null }
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mocks.remote.mockReturnValue({ data: balance, loading: false, refreshing: false, error: "", reload: vi.fn() })
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  async function mount() {
    await act(async () => root.render(
      <LanguageProvider>
        <AiAvailabilityProvider value={{ assistantEnabled: false, insightsEnabled: false }}>
          <FinancialSimulation />
        </AiAvailabilityProvider>
      </LanguageProvider>,
    ))
  }
  async function calculate(incomplete = false) {
    const today = getToday()
    const data = projectNetWorth(simulateCashflow(balance.currentBalance, [], today, today, [],
      [{ name: "Plan", amount: 500000, date: today }]), { ...balance,
      grossWorth: incomplete ? null : balance.grossWorth, netWorth: incomplete ? null : balance.netWorth })
    mocks.request.mockResolvedValue({ ...data, endDate: today })
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
  }
  it("shows current and projected negative net worth with a monthly column and assumptions", async () => {
    await mount()
    expect(container.textContent).toContain(messages.en.currentNetWorth)
    expect(container.textContent).toContain(formatCurrency(-2000000, "en"))
    expect(container.textContent).toContain(messages.en.currentGrossWorth)
    expect(container.textContent).toContain(formatCurrency(3000000, "en"))
    await calculate()
    expect(container.querySelector("dl")!.textContent).toContain(formatCurrency(-2500000, "en"))
    expect(container.querySelector("th:last-child")!.textContent).toBe(messages.en.projectedNetWorth)
    expect(container.querySelector("tbody td:last-child")!.textContent).toBe(formatCurrency(-2500000, "en"))
    expect(container.querySelector("th:nth-last-child(2)")!.textContent).toBe(messages.en.projectedGrossWorth)
    expect(container.querySelector("tbody td:nth-last-child(2)")!.textContent).toBe(formatCurrency(2500000, "en"))
    expect(container.textContent).toContain(messages.en.netWorthProjectionHint)
    expect(mocks.request).toHaveBeenCalledWith("/api/simulation", expect.objectContaining({ method: "POST" }))
    await act(async () => window.dispatchEvent(new Event("finance-data-changed")))
    expect(container.querySelector("table")).toBeNull()
    expect(container.textContent).toContain(messages.en.simulationStale)
  })
  it("labels incomplete current and projected valuations as known subtotals", async () => {
    mocks.remote.mockReturnValue({ data: { ...balance, grossWorth: null, netWorth: null }, loading: false, error: "" })
    await mount()
    await calculate(true)
    expect(container.textContent).toContain(messages.en.currentKnownNetWorth)
    expect(container.textContent).toContain(messages.en.currentKnownGrossWorth)
    expect(container.querySelector("th:nth-last-child(2)")!.textContent).toBe(messages.en.projectedKnownGrossWorth)
    expect(container.querySelector("th:last-child")!.textContent).toBe(messages.en.projectedKnownNetWorth)
    expect(container.textContent).toContain(messages.en.incompleteNetWorthProjection)
    expect(container.textContent).not.toMatch(/NaN|Infinity/)
  })
  it("shows loading and retryable failure without inventing a zero net worth", async () => {
    mocks.remote.mockReturnValue({ data: null, loading: true, error: "" })
    await mount()
    expect(container.textContent).toContain(messages.en.loading)
    expect(container.textContent).not.toContain(formatCurrency(0, "en"))
    mocks.remote.mockReturnValue({ data: null, loading: false, error: "Unable to load", reload: vi.fn() })
    await mount()
    expect(container.querySelector('[role="alert"]')!.textContent).toContain("Unable to load")
    expect(container.textContent).not.toContain(formatCurrency(0, "en"))
  })
})
