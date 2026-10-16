"use client"

import { useEffect, useState } from "react"
import { Bot, Clock3, Loader2, RefreshCw } from "lucide-react"
import { jsonBody, requestJson } from "@/lib/client-api"
import { clearRemoteResourceCache } from "@/lib/remote-resource-cache"
import type { InsightContext, InsightPage, InsightStatus } from "@/lib/ai/insight-contract"
import { useAuth } from "./auth-provider"
import { useAiAvailability } from "./ai-availability-provider"
import { useLanguage } from "./language-provider"
import { ErrorNotice } from "./feedback"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

const nextPage: Record<InsightPage, InsightPage> = {
  dashboard: "transactions", transactions: "budget", investments: "netWorth", budget: "transactions",
  goals: "funds", debts: "calendar", reports: "transactions", financialHealth: "budget",
  planning: "calendar", netWorth: "investments", calendar: "debts", simulation: "planning", funds: "goals",
}

export function PageInsights({ context, ready }: { context: InsightContext; ready: boolean }) {
  const { insightsEnabled } = useAiAvailability()
  const { user } = useAuth()
  const { locale } = useLanguage()
  if (!insightsEnabled || !ready || !user) return null
  return <InsightPanel key={JSON.stringify([user.id, context, locale])} context={context} />
}

function InsightPanel({ context }: { context: InsightContext }) {
  const [attempt, setAttempt] = useState(0)
  return <InsightRun key={attempt} context={context} refresh={attempt > 0} retry={() => setAttempt((value) => value + 1)} />
}

function InsightRun({ context, refresh, retry }: { context: InsightContext; refresh: boolean; retry: () => void }) {
  const { locale, t } = useLanguage()
  const [status, setStatus] = useState<InsightStatus | null>(null)
  const [error, setError] = useState("")
  const body = JSON.stringify({ context, locale, refresh })
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let resolveDelay: (() => void) | undefined
    function delay(milliseconds: number) {
      return new Promise<void>((resolve) => {
        resolveDelay = resolve
        timer = setTimeout(resolve, milliseconds)
      })
    }
    async function analyse() {
      await delay(600)
      if (controller.signal.aborted) return
      let current = await requestJson<InsightStatus>("/api/ai/insights", { ...jsonBody("POST", JSON.parse(body)), signal: controller.signal })
      const deadline = Date.now() + 7 * 60_000
      let staleRetries = 0
      while (!controller.signal.aborted) {
        if (current.status === "failed" || Date.now() > deadline) throw new Error("insightFailed")
        if (current.status === "stale") {
          if (++staleRetries > 3) throw new Error("insightFailed")
          current = await requestJson<InsightStatus>("/api/ai/insights", { ...jsonBody("POST", { ...JSON.parse(body), refresh: false }), signal: controller.signal })
          continue
        }
        setStatus(current)
        if (current.status === "completed") return
        await delay(3000)
        if (controller.signal.aborted) return
        current = await requestJson<InsightStatus>("/api/ai/insights?jobId=" + current.jobId, { signal: controller.signal })
      }
    }
    void analyse().catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "aiUnavailable")
    })
    return () => {
      controller.abort()
      clearTimeout(timer)
      resolveDelay?.()
    }
  }, [body])
  const pending = !error && status?.status !== "completed"
  const result = status?.result
  const target = nextPage[context.page as InsightPage]
  return <Card aria-busy={pending} className="gap-3 py-4 sm:py-5">
    <CardHeader className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5">
      <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-active">
          <Bot aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base">{t("pageInsights")}</CardTitle>
          <CardDescription className="mt-0.5 text-xs leading-relaxed">{t("pageInsightsHint")}</CardDescription>
        </div>
      </div>
      <Button className="min-h-11 shrink-0" variant="ghost" onClick={retry} disabled={pending}>
        <RefreshCw aria-hidden="true" className="size-4" />{t("insightRefresh")}
      </Button>
    </CardHeader>
    <CardContent className="space-y-3 px-4 sm:px-5">
      {pending && <p role="status" className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        {status?.status === "active"
          ? <Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
          : <Clock3 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
        {t(status?.status === "active" ? "insightActive" : "insightWaiting")}
      </p>}
      <ErrorNotice message={error} onRetry={retry} />
      {result && <div className="space-y-3" aria-live="polite">
        <p className="break-words text-sm leading-7">{result.text}</p>
        <div className="flex flex-col gap-3 border-t pt-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1 text-xs leading-relaxed text-muted-foreground">
            <p><time dateTime={result.generatedAt}>{t("insightGenerated", { time: new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(result.generatedAt)) })}</time></p>
            <p>{t("insightReview")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><a href={"#" + target}>{t("insightNext", { page: t(target) })}</a></Button>
            <Button asChild variant="ghost"><a href={"#ai?conversation=" + result.conversationId} onClick={clearRemoteResourceCache}>{t("insightHistory")}</a></Button>
          </div>
        </div>
      </div>}
    </CardContent>
  </Card>
}
