"use client"

import {
  CalendarClock,
  Home,
  Landmark,
  PieChartIcon,
  ReceiptText,
  Target,
  TrendingUp,
  Wallet,
  ChartCandlestick,
  CalendarDays,
  Calculator,
  PiggyBank,
  Scale,
  LogOut,
  MessageSquare,
  HeartPulse,
} from "lucide-react"
import { useLanguage } from "./language-provider"
import { useAuth } from "./auth-provider"
import { useAiAvailability } from "./ai-availability-provider"
import { useState } from "react"
import { Button } from "./ui/button"
import { AddAccountForm } from "./accounts-form"
import { ErrorNotice } from "./feedback"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { useRemoteData } from "@/lib/use-remote-data"
import type { Account } from "@/lib/types"

export const navigationItems = [
  { key: "ai", icon: MessageSquare },
  { key: "dashboard", icon: Home },
  { key: "transactions", icon: ReceiptText },
  { key: "budget", icon: TrendingUp },
  { key: "goals", icon: Target },
  { key: "reports", icon: PieChartIcon },
  { key: "financialHealth", icon: HeartPulse },
  { key: "planning", icon: CalendarClock },
  { key: "debts", icon: Wallet },
  { key: "investments", icon: ChartCandlestick },
  { key: "netWorth", icon: Scale },
  { key: "calendar", icon: CalendarDays },
  { key: "simulation", icon: Calculator },
  { key: "funds", icon: PiggyBank },
]

export function Sidebar({
  activeTab,
  open,
  onClose,
}: {
  activeTab: string
  open: boolean
  onClose: () => void
}) {
  const { locale, setLocale, t } = useLanguage()
  const { user, signOut } = useAuth()
  const { assistantEnabled } = useAiAvailability()
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  async function handleSignOut() {
    setSigningOut(true)
    setSignOutError(false)
    try {
      await signOut()
    } catch {
      setSignOutError(true)
    } finally {
      setSigningOut(false)
    }
  }
  const accounts = useRemoteData<Account[]>("/api/accounts")
  function content(mobile: boolean) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b px-5 pr-12 md:pr-5">
          <div className="rounded-lg bg-brand p-2 text-white">
            <Landmark aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold">Finance Tracker</p>
            <p className="text-xs text-muted-foreground">
              {t("personalFinance")}
            </p>
          </div>
        </div>
        <nav
          aria-label={t("navigate")}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        >
          {[
            {
              label: "dailyNavigation",
              keys: ["dashboard", "transactions", "ai", "budget", "goals", "debts"],
            },
            {
              label: "planNavigation",
              keys: ["planning", "funds", "calendar", "simulation"],
            },
            {
              label: "reviewNavigation",
              keys: ["reports", "financialHealth", "investments", "netWorth"],
            },
          ].map(({ label, keys }) => (
            <section
              key={label}
              aria-labelledby={(mobile ? "mobile-" : "desktop-") + label}
              className="mb-5 last:mb-0"
            >
              <h2
                id={(mobile ? "mobile-" : "desktop-") + label}
                className="mb-2 px-3 text-xs font-medium text-muted-foreground"
              >
                {t(label)}
              </h2>
              <ul className="space-y-1">
                {keys
                  .map(
                    (key) => navigationItems.find((item) => item.key === key)!,
                  )
                  .map(({ key, icon: Icon }) => {
                    const disabled = key === "ai" && !assistantEnabled
                    return (
                      <li key={key}>
                        <a
                          href={disabled ? undefined : "#" + key}
                          role={disabled ? "link" : undefined}
                          aria-disabled={disabled || undefined}
                          title={disabled ? t("aiDisabled") : undefined}
                          aria-current={activeTab === key ? "page" : undefined}
                          onClick={disabled ? undefined : onClose}
                          className={
                            "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors " +
                            (disabled
                              ? "cursor-not-allowed text-muted-foreground opacity-50"
                              : activeTab === key
                              ? "bg-brand-soft font-semibold text-brand-active"
                              : "text-slate-600 hover:bg-muted hover:text-foreground")
                          }
                        >
                          <Icon
                            aria-hidden="true"
                            className="h-[18px] w-[18px] shrink-0"
                          />
                          {t(key)}
                        </a>
                      </li>
                    )
                  })}
              </ul>
            </section>
          ))}
          <div className="mt-7 border-t pt-5">
            <p className="mb-3 px-3 text-xs font-medium text-muted-foreground">
              {t("accounts")}
            </p>
            {accounts.error ? (
              <ErrorNotice message={accounts.error} onRetry={accounts.reload} />
            ) : accounts.loading ? (
              <p role="status" className="px-3 text-xs text-muted-foreground">
                {t("loading")}
              </p>
            ) : (
              <ul className="mb-4 space-y-2 px-3">
                {accounts.data?.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <a
                      href="#dashboard"
                      onClick={onClose}
                      className="flex min-h-11 min-w-0 items-center rounded-md font-medium hover:text-brand-active"
                      title={t("manageAccounts")}
                    >
                      <span className="truncate">{account.name}</span>
                    </a>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {t(account.type)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-3">
              <AddAccountForm />
            </div>
          </div>
        </nav>
        <div className="border-t p-5">
          <p
            className="mb-2 truncate text-xs text-muted-foreground"
            title={user?.email}
          >
            {user?.email}
          </p>
          <Button
            variant="outline"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mb-3 min-h-11 w-full"
          >
            <LogOut aria-hidden="true" className="size-4" />
            {t(signingOut ? "authWorking" : "signOut")}
          </Button>
          {signOutError && (
            <p role="alert" className="mb-3 text-sm text-red-800">
              {t("authFailed")}
            </p>
          )}
          <label
            className="mb-2 block text-xs font-medium text-muted-foreground"
            htmlFor={mobile ? "mobile-language" : "desktop-language"}
          >
            {t("language")}
          </label>
          <Select
            value={locale}
            onValueChange={(value) => setLocale(value as "en" | "id")}
          >
            <SelectTrigger
              id={mobile ? "mobile-language" : "desktop-language"}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="id">Bahasa Indonesia</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    )
  }
  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r bg-white md:block">
        {content(false)}
      </aside>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) onClose()
        }}
      >
        <DialogContent className="!left-0 !top-0 !h-dvh !max-h-dvh !w-[min(300px,90vw)] !max-w-none !translate-x-0 !translate-y-0 !rounded-none !p-0">
          <DialogTitle className="sr-only">{t("navigate")}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("personalFinance")}
          </DialogDescription>
          {content(true)}
        </DialogContent>
      </Dialog>
    </>
  )
}
