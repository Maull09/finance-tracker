"use client"

import { MoneyInput } from "./money-input"
import { AssetRateAttribution } from "./asset-rate-attribution"
import { parseMoneyInput } from "@/lib/money-input"

import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { getCurrentMonth } from "@/lib/finance"
import { calculateFinancialHealth, healthInputSchema, type FinancialHealthReport } from "@/lib/financial-health"
import { useRemoteData } from "@/lib/use-remote-data"
import { clearRemoteResourceCache } from "@/lib/remote-resource-cache"
import { PageInsights } from "./page-insights"
import { MonthPicker } from "./month-picker"
import { useLanguage } from "./language-provider"
import { ErrorNotice, Field, LoadingState, PageHeading } from "./feedback"
import { Button } from "./ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"

export function FinancialHealth() {
  const { t } = useLanguage()
  const [month, setMonth] = useState(getCurrentMonth)
  const records = useRemoteData<FinancialHealthReport>("/api/financial-health?month=" + month)
  function reload() {
    clearRemoteResourceCache()
    records.reload()
  }
  return (
    <div className="space-y-6">
      <PageHeading title={t("financialHealth")} description={t("healthDescription")}>
        <Field id="health-month" label={t("healthPeriod")}>
          <MonthPicker id="health-month" min="1900-01" max={getCurrentMonth()} value={month} onChange={setMonth} />
        </Field>
        <Button variant="outline" onClick={reload} disabled={records.loading || records.refreshing}>
          <RefreshCw aria-hidden="true" className="size-4" />
          {t(records.refreshing ? "refreshing" : "refresh")}
        </Button>
      </PageHeading>
      <ErrorNotice message={records.error} onRetry={reload} />
      {records.refreshing && <p role="status" className="text-sm text-muted-foreground">{t("refreshing")}</p>}
      {records.loading ? <LoadingState /> : records.data && <HealthAnalysis key={month} snapshot={records.data} refreshing={records.refreshing || Boolean(records.error)} />}
      <AssetRateAttribution />
    </div>
  )
}

function HealthAnalysis({ snapshot, refreshing }: { snapshot: FinancialHealthReport; refreshing: boolean }) {
  const { locale, t, formatCurrency, formatDate, formatMonth } = useLanguage()
  const [essentialExpense, setEssentialExpense] = useState("")
  const [monthlyDebtPayment, setMonthlyDebtPayment] = useState("")
  const parsed = healthInputSchema.safeParse({
    month: snapshot.month,
    essentialExpense: essentialExpense === "" ? null : parseMoneyInput(essentialExpense, 0, 2_147_483_647) ?? NaN,
    monthlyDebtPayment: monthlyDebtPayment === "" ? null : parseMoneyInput(monthlyDebtPayment, 0, 2_147_483_647) ?? NaN,
  })
  const valid = parsed.success && (parsed.data.monthlyDebtPayment === null || parsed.data.monthlyDebtPayment >= snapshot.recordedDebtPayments)
  const report = calculateFinancialHealth(snapshot, valid && parsed.success ? parsed.data : {
    month: snapshot.month, essentialExpense: null, monthlyDebtPayment: null,
  })
  const percent = (value: number | null) => value === null ? t("notAvailable") : new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", {
    style: "percent", maximumFractionDigits: 1,
  }).format(value)
  const amount = (value: number | null) => value === null ? t("notAvailable") : formatCurrency(value)
  const number = (value: number) => new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { maximumFractionDigits: 1 }).format(value)
  const metrics = [
    { label: "healthSavings", formula: "healthSavingsFormula", value: percent(report.savingsRate), score: report.components.savings },
    { label: "healthEmergency", formula: "healthEmergencyFormula", value: report.emergencyMonths === null ? t("notAvailable") : t("healthMonths", { value: number(report.emergencyMonths) }), score: report.components.emergency },
    { label: "healthDebtService", formula: "healthDebtServiceFormula", value: percent(report.debtServiceRatio), score: report.components.debtService },
    { label: "healthDebtAssets", formula: "healthDebtAssetsFormula", value: percent(report.debtToAssetRatio), score: report.components.debtToAsset },
    { label: "healthExpense", formula: "healthExpenseFormula", value: percent(report.expenseRatio) },
    { label: "healthNetWorth", formula: "healthNetWorthFormula", value: amount(report.netWorth) },
    { label: "healthStability", formula: "healthStabilityFormula", value: amount(report.cashFlowDeviation) },
  ]
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{t("healthSnapshot", { date: formatDate(report.asOf), month: formatMonth(report.month) })}</p>
      {report.partial && <p className="rounded-xl border border-brand-border bg-brand-soft p-4 text-sm text-brand-active">{t("healthProvisional")}</p>}
      <Card>
        <CardHeader>
          <CardTitle>{t("healthInputs")}</CardTitle>
          <CardDescription>{t("healthInputsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-5 md:grid-cols-2">
            <Field id="health-essential" label={t("healthEssentialInput")} hint={t("healthEssentialHint")}>
              <MoneyInput className="min-h-11" id="health-essential" min="0" max="2147483647" value={essentialExpense}
                aria-describedby="health-essential-hint" aria-invalid={!valid}
                onChange={(event) => setEssentialExpense(event.target.value)} />
            </Field>
            <Field id="health-debt" label={t("healthDebtInput")} hint={t("healthDebtHint", { amount: formatCurrency(snapshot.recordedDebtPayments) })}>
              <MoneyInput className="min-h-11" id="health-debt" min={snapshot.recordedDebtPayments} max="2147483647" value={monthlyDebtPayment}
                aria-describedby="health-debt-hint" aria-invalid={!valid}
                onChange={(event) => setMonthlyDebtPayment(event.target.value)} />
            </Field>
          </div>
          {!valid && <p role="alert" className="text-sm text-destructive">{t("healthInputInvalid")}</p>}
        </CardContent>
      </Card>
      <section aria-labelledby="health-score-heading" className="overflow-hidden rounded-xl border bg-card">
        <div className="grid md:grid-cols-3">
          <div className="bg-brand-soft p-6">
            <h2 id="health-score-heading" className="text-sm font-medium text-brand-active">{t("healthScore")}</h2>
            <p className="mt-3 text-4xl font-semibold tabular-nums">{report.score ?? "—"}<span className="ml-2 text-base font-normal text-muted-foreground">/ 100</span></p>
            <p className="mt-3 font-medium">{t(report.status)}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t("healthHeuristic")}</p>
          </div>
          <div className="space-y-4 p-6 md:col-span-2">
            {report.score === null && <p className="text-sm text-muted-foreground">{t("healthCompleteHint")}</p>}
            <dl className="grid gap-5 sm:grid-cols-3">
              {[
                { label: "healthIncome", value: report.income },
                { label: "healthSpending", value: report.expense },
                { label: "healthSurplus", value: report.surplus },
                { label: "healthLiquid", value: report.liquidAssets },
                { label: "healthAssets", value: report.totalAssets },
                { label: "healthLiabilities", value: report.totalLiabilities },
              ].map(({ label, value }) => <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t(label)}</dt>
                <dd className="mt-2 break-words text-lg font-semibold tabular-nums">{amount(value)}</dd>
              </div>)}
            </dl>
            {report.unpricedHoldings > 0 && <p className="text-sm text-destructive">{t("healthUnpriced", { count: report.unpricedHoldings })}</p>}
            {report.oldestPriceDate && <p className="text-xs text-muted-foreground">{t("healthPriceDate", { date: formatDate(report.oldestPriceDate) })}</p>}
          </div>
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => <Card key={metric.label}>
          <CardHeader><CardTitle className="text-base">{t(metric.label)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="break-words text-2xl font-semibold tabular-nums">{metric.value}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{t(metric.formula)}</p>
            {metric.score !== undefined && metric.score !== null && <p className="text-xs tabular-nums text-brand-active">{t("healthScore")}: {number(metric.score)} / 100</p>}
          </CardContent>
        </Card>)}
      </div>
      <Card>
        <CardHeader><CardTitle>{t("healthBehaviour")}</CardTitle><CardDescription>{t("healthCountHint")}</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <HealthMetric label={t("healthTransactionCount")} value={number(report.transactionCount)} />
            <HealthMetric label={t("healthTransferCount")} value={number(report.transferCount)} />
            <HealthMetric label={t("healthVolatility")} value={percent(report.spendingVolatility)} hint={t("healthVolatilityHint")} />
            <HealthMetric label={t("healthRecurring")} value={percent(report.recurringCommitmentRatio)} hint={t("healthRecurringHint")} />
            <HealthMetric label={t("healthConcentration")} value={percent(report.incomeConcentration)} hint={t("healthConcentrationHint")} />
          </dl>
          <p className="text-xs text-muted-foreground">{t("healthHistoryHint", { count: report.historyMonths })}</p>
        </CardContent>
      </Card>
      <PageInsights context={{ page: "financialHealth", input: report.input }} ready={valid && !refreshing} />
      <details className="rounded-xl border bg-card p-5">
        <summary className="min-h-11 cursor-pointer content-center font-medium focus-visible:outline-2 focus-visible:outline-ring">{t("healthMethod")}</summary>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          {["healthMethodWeights", "healthMethodNormalization", "healthMethodRecords", "healthMethodAssets", "healthMethodHistory"].map((key) => <p key={key}>{t(key)}</p>)}
        </div>
      </details>
    </div>
  )
}

function HealthMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="min-w-0"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 text-xl font-semibold tabular-nums">{value}</dd>{hint && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>}</div>
}
