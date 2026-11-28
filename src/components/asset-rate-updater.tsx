"use client"

import { useEffect } from "react"
import { requestJson } from "@/lib/client-api"

export function AssetRateUpdater() {
  useEffect(() => {
    let active = true
    let busy = false
    const refresh = async () => {
      if (busy || document.visibilityState === "hidden") return
      busy = true
      try {
        const result = await requestJson<{ updated: number }>("/api/asset-rates/refresh", { method: "POST" })
        if (active && result.updated > 0) window.dispatchEvent(new Event("finance-data-changed"))
      } catch {
        // Account cards retain quote dates and expose manual refresh errors.
      } finally { busy = false }
    }
    const initial = window.setTimeout(() => void refresh(), 0)
    const interval = window.setInterval(() => void refresh(), 15 * 60000)
    window.addEventListener("finance-data-changed", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => { active = false; window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("finance-data-changed", refresh); document.removeEventListener("visibilitychange", refresh) }
  }, [])
  return null
}
