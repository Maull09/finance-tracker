// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { hydrateRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeSelector } from "@/components/theme-selector"
import { themeInitializationScript } from "@/lib/theme"
import { messages } from "@/lib/i18n"

const state = vi.hoisted(() => ({ locale: "en" as "en" | "id" }))
vi.mock("@/components/language-provider", () => ({ useLanguage: () => ({
  t: (key: string) => messages[state.locale][key] ?? key,
}) }))

describe("appearance preference", () => {
  let root: Root | undefined
  let container: HTMLDivElement
  let systemDark: boolean
  const listeners = new Set<() => void>()
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    state.locale = "en"
    systemDark = false
    listeners.clear()
    localStorage.clear()
    document.documentElement.className = ""
    delete document.documentElement.dataset.theme
    document.documentElement.style.colorScheme = ""
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return systemDark },
      addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
    })))
    container = document.createElement("div")
    document.body.append(container)
  })
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })
  function initialize() { new Function(themeInitializationScript)() }
  async function mount() {
    initialize()
    root = createRoot(container)
    await act(async () => root!.render(<><ThemeSelector /><ThemeSelector /></>))
  }
  async function choose(value: string) {
    await act(async () => {
      const select = container.querySelector("select")!
      select.value = value
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
  }
  async function deviceTheme(dark: boolean) {
    systemDark = dark
    await act(async () => { listeners.forEach((listener) => listener()) })
  }
  it.each(["en", "id"] as const)("labels all choices in %s and keeps selectors in sync", async (locale) => {
    state.locale = locale
    await mount()
    const selects = [...container.querySelectorAll("select")]
    const labels = [...container.querySelectorAll("label")]
    expect(labels.map((label) => label.textContent)).toEqual([messages[locale].appearance, messages[locale].appearance])
    expect(selects[0].textContent).toBe(messages[locale].themeLight + messages[locale].themeDark + messages[locale].themeSystem)
    expect(labels[0].htmlFor).toBe(selects[0].id)
    expect(selects[0].id).not.toBe(selects[1].id)
    await choose("dark")
    expect(selects.map((select) => select.value)).toEqual(["dark", "dark"])
    expect(localStorage.getItem("theme")).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    await deviceTheme(false)
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    await choose("light")
    await deviceTheme(true)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
  it("follows changing device preferences only in system mode", async () => {
    systemDark = true
    await mount()
    expect(container.querySelector("select")!.value).toBe("system")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    await deviceTheme(false)
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    await choose("dark")
    await choose("system")
    expect(localStorage.getItem("theme")).toBe("system")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    await deviceTheme(true)
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
  it("applies a saved preference before hydration and restores the selected control", async () => {
    localStorage.setItem("theme", "dark")
    container.innerHTML = renderToString(<ThemeSelector />)
    initialize()
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    const errors: unknown[] = []
    await act(async () => { root = hydrateRoot(container, <ThemeSelector />, { onRecoverableError: (error) => errors.push(error) }) })
    expect(errors).toEqual([])
    expect(container.querySelector("select")!.value).toBe("dark")
  })
  it("ignores invalid saved preferences and keeps switching usable when storage is blocked", async () => {
    localStorage.setItem("theme", "invalid")
    systemDark = true
    await mount()
    expect(container.querySelector("select")!.value).toBe("system")
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked") })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked") })
    expect(initialize).not.toThrow()
    await choose("light")
    expect(container.querySelector("select")!.value).toBe("light")
    expect(document.documentElement.style.colorScheme).toBe("light")
  })
  it("syncs preference changes from another tab and cleans up media listeners", async () => {
    await mount()
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: "dark" })))
    expect(container.querySelector("select")!.value).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "locale", newValue: "id" })))
    expect(container.querySelector("select")!.value).toBe("dark")
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: null })))
    expect(container.querySelector("select")!.value).toBe("system")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    await act(async () => root!.unmount())
    root = undefined
    expect(listeners.size).toBe(0)
  })
})
