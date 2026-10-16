// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { messages } from "@/lib/i18n"
import { AiAvailabilityProvider } from "@/components/ai-availability-provider"
import { AiAssistant } from "@/components/ai-assistant"
import { AiTransactionDrafts, ReceiptReader } from "@/components/ai-transaction-drafts"
import { Sidebar } from "@/components/sidebar"

const mocks = vi.hoisted(() => ({ remote: vi.fn(), request: vi.fn(), locale: "en" as "en" | "id" }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: mocks.remote }))
vi.mock("@/lib/client-api", async (original) => ({ ...await original<object>(), requestJson: mocks.request }))
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ user: { id: "alice" }, signOut: vi.fn() }) }))
vi.mock("@/components/accounts-form", () => ({ AddAccountForm: () => null }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({
  locale: mocks.locale, setLocale: vi.fn(), t: (key: string) => (messages[mocks.locale] as Record<string, string>)[key] ?? key,
}) }))

describe("AI availability before feature mount", () => {
  let root: Root
  let container: HTMLDivElement
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.locale = "en"
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  async function mount(children: React.ReactNode, assistantEnabled = false) {
    await act(async () => root.render(
      <AiAvailabilityProvider value={{ assistantEnabled, insightsEnabled: false }}>
        {children}
      </AiAvailabilityProvider>,
    ))
  }
  it.each(["en", "id"] as const)("shows disabled chat immediately in %s without fetching history", async (locale) => {
    mocks.locale = locale
    await mount(<AiAssistant />)
    expect(container.textContent).toContain(messages[locale].aiDisabled)
    expect(container.querySelector("button, textarea, [aria-busy]")).toBeNull()
    expect(mocks.remote).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("disables receipt reading before the upload dialog mounts", async () => {
    await mount(<ReceiptReader accounts={[]} />)
    const button = container.querySelector("button")!
    expect(button.disabled).toBe(true)
    expect(button.title).toBe(messages.en.aiDisabled)
    await act(async () => button.click())
    expect(container.querySelector('[role="dialog"], input[type="file"]')).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it("keeps chat available with Redis disabled and AI enabled", async () => {
    mocks.remote.mockReturnValue({ data: [], loading: false, error: "", reload: vi.fn() })
    await mount(<AiAssistant />, true)
    expect(mocks.remote).toHaveBeenCalledWith("/api/ai/conversations")
    expect(container.querySelector("button")?.disabled).toBe(false)
    expect(container.textContent).not.toContain(messages.en.aiDisabled)
  })
  it("keeps receipt reading available with Redis disabled and AI enabled", async () => {
    await mount(<ReceiptReader accounts={[]} />, true)
    expect(container.querySelector("button")?.disabled).toBe(false)
  })
  it("disables AI navigation before entering chat", async () => {
    mocks.remote.mockReturnValue({ data: [], loading: false, error: "" })
    await mount(<Sidebar activeTab="dashboard" open={false} onClose={vi.fn()} />)
    const link = container.querySelector('a[aria-disabled="true"]')!
    expect(link.textContent).toBe(messages.en.ai)
    expect(link.hasAttribute("href")).toBe(false)
    expect(link.getAttribute("title")).toBe(messages.en.aiDisabled)
    expect(container.querySelector('a[href="#transactions"]')).not.toBeNull()
  })
  it("keeps AI navigation available with Redis disabled and AI enabled", async () => {
    mocks.remote.mockReturnValue({ data: [], loading: false, error: "" })
    await mount(<Sidebar activeTab="dashboard" open={false} onClose={vi.fn()} />, true)
    expect(container.querySelector('a[href="#ai"]')).not.toBeNull()
    expect(container.querySelector('a[aria-disabled="true"]')).toBeNull()
  })
  it("still loads saved drafts for review while AI is disabled", async () => {
    mocks.remote.mockReturnValue({ data: [], loading: false, error: "" })
    await mount(<AiTransactionDrafts accounts={[]} />)
    expect(mocks.remote).toHaveBeenCalledWith("/api/ai/drafts")
  })
})
