"use client"

import { useId, useSyncExternalStore } from "react"
import { SunMoon } from "lucide-react"
import { currentTheme, setTheme, subscribeTheme, type Theme } from "@/lib/theme"
import { useLanguage } from "./language-provider"

export function ThemeSelector() {
  const id = useId()
  const { t } = useLanguage()
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "system" as Theme)
  return (
    <div className="relative shrink-0">
      <label htmlFor={id} className="sr-only">{t("appearance")}</label>
      <SunMoon aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <select id={id} value={theme} onChange={(event) => setTheme(event.target.value as Theme)}
        className="min-h-11 max-w-40 cursor-pointer rounded-md border bg-card py-2 pl-9 pr-2 text-sm" title={t("appearance")}>
        <option value="light">{t("themeLight")}</option>
        <option value="dark">{t("themeDark")}</option>
        <option value="system">{t("themeSystem")}</option>
      </select>
    </div>
  )
}
