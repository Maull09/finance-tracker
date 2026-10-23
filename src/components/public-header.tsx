"use client"

import Link from "next/link"
import { Landmark } from "lucide-react"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"
import { ThemeSelector } from "./theme-selector"

export function PublicHeader() {
  const { locale, setLocale, t } = useLanguage()
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-4 sm:px-8">
      <Link
        href="/"
        className="flex min-h-11 items-center gap-2 rounded-md text-sm font-semibold tracking-tight sm:gap-3 sm:text-base"
      >
        <span className="rounded-lg bg-brand p-2 text-white">
          <Landmark className="size-5" aria-hidden="true" />
        </span>
        <span>Finance Tracker</span>
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <ThemeSelector />
        <label className="sr-only" htmlFor="public-language">
          {t("language")}
        </label>
        <select
          id="public-language"
          value={locale}
          onChange={(event) => setLocale(event.target.value as "en" | "id")}
          className="min-h-11 max-w-32 cursor-pointer rounded-md border bg-card px-2 text-sm"
        >
          <option value="en">English</option>
          <option value="id">Indonesia</option>
        </select>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
      </div>
    </header>
  )
}
