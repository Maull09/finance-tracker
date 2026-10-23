// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { messages } from "@/lib/i18n"

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), replace: vi.fn(), refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }))
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.signIn } }) }))
vi.mock("@/components/public-header", () => ({ PublicHeader: () => null }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({ t: (key: string) => messages.en[key] ?? key }) }))
import { AuthForm } from "@/components/auth-form"

describe("authentication form activation", () => {
  let container: HTMLDivElement
  let root: Root
  beforeEach(() => {
    vi.resetAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })
  it.each(["sign-in", "sign-up"] as const)("disables %s credentials before hydration and never uses a GET submission", (mode) => {
    container.innerHTML = renderToString(<AuthForm mode={mode} />)
    expect(container.querySelector<HTMLInputElement>("#auth-email")?.disabled).toBe(true)
    expect(container.querySelector("form")?.method).toBe("post")
    expect(container.querySelector("#auth-password")?.matches(":disabled")).toBe(true)
    expect(mocks.signIn).not.toHaveBeenCalled()
    container.innerHTML = ""
  })
  it("activates client controls and keeps provider errors on the form", async () => {
    mocks.signIn.mockResolvedValue({ data: {}, error: { code: "invalid_credentials" } })
    await act(async () => root.render(<AuthForm mode="sign-in" />))
    expect(container.querySelector<HTMLInputElement>("#auth-email")?.disabled).toBe(false)
    const show = container.querySelector<HTMLButtonElement>('button[aria-pressed]')!
    await act(async () => show.click())
    expect(container.querySelector<HTMLInputElement>("#auth-password")?.type).toBe("text")
    await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(mocks.signIn).toHaveBeenCalledOnce()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(messages.en.authInvalidCredentials)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
