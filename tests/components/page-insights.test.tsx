// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { messages } from "@/lib/i18n"

const mocks = vi.hoisted(() => ({ request: vi.fn(), user: { id: "alice" } as { id: string } | null, locale: "en" as "en" | "id" }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ user: mocks.user }) }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ locale: mocks.locale,
  t: (key: string, values?: Record<string, string>) => {
    let text = (messages[mocks.locale] as Record<string, string>)[key] ?? key
    for (const [name, value] of Object.entries(values ?? {})) text = text.replace("{" + name + "}", value)
    return text
  },
}) }))
import { PageInsights } from "@/components/page-insights"

describe("automatic page insights", () => {
  let root: Root
  let container: HTMLDivElement
  const completed = { jobId: "job", status: "completed", result: { text: "Recorded expense Rp500.000", generatedAt: "2026-10-10T00:00:00Z", conversationId: "00000000-0000-4000-8000-000000000001" } }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.user = { id: "alice" }; mocks.locale = "en"
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
  })
  async function mount(page: "dashboard" | "investments" = "dashboard", ready = true) {
    await act(async () => root.render(<PageInsights context={{ page }} ready={ready} />))
  }
  async function advance(ms: number) {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms) })
  }
  it("waits for page data, starts automatically, polls and links to the saved conversation", async () => {
    mocks.request.mockResolvedValueOnce({ jobId: "job", status: "waiting" }).mockResolvedValueOnce(completed)
    await mount("dashboard", false)
    await advance(1000)
    expect(mocks.request).not.toHaveBeenCalled()
    await mount()
    expect(container.textContent).toContain("Your analysis is waiting")
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    await advance(600)
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({ context: { page: "dashboard" }, locale: "en", refresh: false })
    await advance(3000)
    expect(container.textContent).toContain(completed.result.text)
    expect(container.querySelector('a[href^="#ai?conversation="]')).not.toBeNull()
    expect(container.textContent).toContain("Analysed")
    expect(container.querySelector('[aria-busy="false"]')).not.toBeNull()
    expect(container.querySelector('time')?.getAttribute("datetime")).toBe(completed.result.generatedAt)
    expect(container.querySelector('a[href="#transactions"]')).not.toBeNull()
  })
  it("aborts earlier page requests and never shows their late results", async () => {
    let resolveOld!: (value: typeof completed) => void
    mocks.request.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
    mocks.request.mockResolvedValueOnce({ ...completed, result: { ...completed.result, text: "Portfolio result" } })
    await mount()
    await advance(600)
    const oldSignal = mocks.request.mock.calls[0][1].signal as AbortSignal
    await mount("investments")
    expect(oldSignal.aborted).toBe(true)
    await act(async () => resolveOld(completed))
    expect(container.textContent).not.toContain(completed.result.text)
    await advance(600)
    expect(container.textContent).toContain("Portfolio result")
  })
  it("uses the refresh path on reanalysis and clears results when identity or locale changes", async () => {
    mocks.request.mockResolvedValue(completed)
    await mount(); await advance(600)
    const button = container.querySelector("button")!
    await act(async () => button.click())
    expect(container.textContent).not.toContain(completed.result.text)
    await advance(600)
    expect(JSON.parse(mocks.request.mock.calls[1][1].body).refresh).toBe(true)
    mocks.locale = "id"
    await mount()
    expect(container.textContent).toContain("Analisis Anda sedang menunggu")
    mocks.user = { id: "bob" }
    await mount()
    mocks.user = null
    await mount()
    expect(container.textContent).toBe("")
  })
  it("shows a retryable failure and stops polling", async () => {
    mocks.request.mockResolvedValueOnce({ jobId: "job", status: "failed" })
    await mount(); await advance(600)
    expect(container.textContent).toContain("The analysis could not finish")
    await advance(10000)
    expect(mocks.request).toHaveBeenCalledOnce()
    expect(container.querySelector("button")?.disabled).toBe(false)
  })
  it.each(["en", "id"] as const)("explains disabled AI in %s and stops polling", async (locale) => {
    mocks.locale = locale
    mocks.request.mockRejectedValueOnce(new Error("aiDisabled"))
    await mount(); await advance(600)
    expect(container.textContent).toContain(messages[locale].aiDisabled)
    expect(container.querySelector('[aria-busy="false"]')).not.toBeNull()
    await advance(10000)
    expect(mocks.request).toHaveBeenCalledOnce()
  })
  it("announces active analysis and keeps reanalysis disabled until completion", async () => {
    mocks.request.mockResolvedValueOnce({ jobId: "job", status: "active" }).mockResolvedValueOnce(completed)
    await mount(); await advance(600)
    expect(container.querySelector('[role="status"]')?.textContent).toContain(messages.en.insightActive)
    expect(container.querySelector("button")?.disabled).toBe(true)
    await advance(3000)
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(container.querySelector("button")?.disabled).toBe(false)
  })
})
