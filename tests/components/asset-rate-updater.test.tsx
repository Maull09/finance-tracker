// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AssetRateUpdater } from "@/components/asset-rate-updater"

const state = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock("@/lib/client-api", () => ({ requestJson: state.request }))

describe("automatic asset-rate refresh", () => {
  let container: HTMLDivElement; let root: Root
  beforeEach(() => {
    vi.resetAllMocks(); vi.useFakeTimers()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    state.request.mockResolvedValue({ updated: 0 })
    container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks() })
  async function mount() { await act(async () => { root.render(<StrictMode><AssetRateUpdater /></StrictMode>); }); await act(async () => { await vi.advanceTimersByTimeAsync(0) }) }
  it("refreshes once under StrictMode and invalidates changed values without a request loop", async () => {
    state.request.mockResolvedValue({ updated: 1 })
    const changed = vi.fn(); window.addEventListener("finance-data-changed", changed)
    try { await mount(); expect(state.request).toHaveBeenCalledOnce(); expect(changed).toHaveBeenCalledOnce() }
    finally { window.removeEventListener("finance-data-changed", changed) }
  })
  it("refreshes every 15 minutes and after a quantity update", async () => {
    await mount()
    await act(async () => { await vi.advanceTimersByTimeAsync(15 * 60000) })
    expect(state.request).toHaveBeenCalledTimes(2)
    await act(async () => { window.dispatchEvent(new Event("finance-data-changed")) })
    expect(state.request).toHaveBeenCalledTimes(3)
  })
  it("skips hidden-tab checks and refreshes when visible again", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    await mount(); expect(state.request).not.toHaveBeenCalled()
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible")
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")) })
    expect(state.request).toHaveBeenCalledOnce()
  })
  it("stops future checks after unmount and does not fake a successful update on failure", async () => {
    state.request.mockRejectedValue(new Error("assetRatesUnavailable"))
    await mount(); expect(state.request).toHaveBeenCalledOnce()
    await act(async () => root.render(null))
    await act(async () => { await vi.advanceTimersByTimeAsync(30 * 60000); window.dispatchEvent(new Event("finance-data-changed")) })
    expect(state.request).toHaveBeenCalledOnce()
  })
})
