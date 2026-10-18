"use client"

import { PageInsights } from "./page-insights"
import { useEffect, useRef, useState } from "react"
import { Calculator, Loader2, Plus, Trash2 } from "lucide-react"
import { useLanguage } from "./language-provider"
import { ErrorNotice, Field, PageHeading } from "./feedback"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { getNextMonthStart, getToday } from "@/lib/finance"
import { jsonBody, requestJson } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import type {
  PlannedCashflow,
  SimulationBalanceData,
  SimulationData,
} from "@/lib/planning-types"

type CashflowDraft = Omit<PlannedCashflow, "amount"> & { amount: string }
type CashflowKind = "income" | "expense"

function endOfNextMonth() {
  const nextMonth = getNextMonthStart(getToday().slice(0, 7)).slice(0, 7)
  const end = new Date(getNextMonthStart(nextMonth) + "T00:00:00Z")
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

function maximumProjectionDate() {
  return new Date(Date.parse(getToday()) + 730 * 86400000)
    .toISOString()
    .slice(0, 10)
}

function PlannedCashflowList({
  kind,
  entries,
  today,
  endDate,
  canAdd,
  onAdd,
  onUpdate,
  onRemove,
}: {
  kind: CashflowKind
  entries: CashflowDraft[]
  today: string
  endDate: string
  canAdd: boolean
  onAdd: () => void
  onUpdate: (index: number, update: Partial<CashflowDraft>) => void
  onRemove: (index: number) => void
}) {
  const { t } = useLanguage()
  const labels =
    kind === "income"
      ? {
          title: t("addedIncome"),
          hint: t("additionalIncomeHint"),
          add: t("addIncome"),
          remove: t("removeIncome"),
          name: t("incomeName"),
          amount: t("incomeAmount"),
          date: t("incomeDate"),
        }
      : {
          title: t("addedExpenses"),
          hint: t("additionalExpenseHint"),
          add: t("addExpense"),
          remove: t("removeExpense"),
          name: t("expenseName"),
          amount: t("expenseAmount"),
          date: t("expenseDate"),
        }
  const titleId = `added-${kind}-title`

  return (
    <section aria-labelledby={titleId} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={titleId} className="font-semibold">
            {labels.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{labels.hint}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={onAdd}
          disabled={!canAdd}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {labels.add}
        </Button>
      </div>
      {entries.map((entry, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-lg border bg-slate-50 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
        >
          <Field id={`${kind}-name-${index}`} label={labels.name} required>
            <Input
              id={`${kind}-name-${index}`}
              value={entry.name}
              maxLength={120}
              onChange={(event) =>
                onUpdate(index, { name: event.target.value })
              }
              required
            />
          </Field>
          <Field id={`${kind}-amount-${index}`} label={labels.amount} required>
            <Input
              id={`${kind}-amount-${index}`}
              type="number"
              min="1"
              max="2147483647"
              step="1"
              inputMode="numeric"
              value={entry.amount}
              onChange={(event) =>
                onUpdate(index, { amount: event.target.value })
              }
              required
            />
          </Field>
          <Field id={`${kind}-date-${index}`} label={labels.date} required>
            <Input
              id={`${kind}-date-${index}`}
              type="date"
              min={today}
              max={endDate}
              value={entry.date}
              onChange={(event) =>
                onUpdate(index, { date: event.target.value })
              }
              required
            />
          </Field>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
            onClick={() => onRemove(index)}
            aria-label={labels.remove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
    </section>
  )
}

export function FinancialSimulation() {
  const { t, formatCurrency, formatMonth } = useLanguage()
  const [endDate, setEndDate] = useState(endOfNextMonth())
  const [incomes, setIncomes] = useState<CashflowDraft[]>([])
  const [expenses, setExpenses] = useState<CashflowDraft[]>([])
  const [result, setResult] = useState<SimulationData | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [stale, setStale] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const compared = useRef(false)
  const balance = useRemoteData<SimulationBalanceData>("/api/simulation")
  const today = getToday()

  function invalidate() {
    controller.current?.abort()
    setResult(null)
    setBusy(false)
    setError("")
    setStale(compared.current)
  }

  useEffect(() => {
    window.addEventListener("finance-data-changed", invalidate)
    return () => {
      window.removeEventListener("finance-data-changed", invalidate)
      controller.current?.abort()
    }
  }, [])

  function updateIncome(index: number, update: Partial<CashflowDraft>) {
    invalidate()
    setIncomes((current) =>
      current.map((income, itemIndex) =>
        itemIndex === index ? { ...income, ...update } : income,
      ),
    )
  }

  function updateExpense(index: number, update: Partial<CashflowDraft>) {
    invalidate()
    setExpenses((current) =>
      current.map((expense, itemIndex) =>
        itemIndex === index ? { ...expense, ...update } : expense,
      ),
    )
  }

  function addIncome() {
    invalidate()
    setIncomes((current) => [...current, { name: "", amount: "", date: today }])
  }

  function addExpense() {
    invalidate()
    setExpenses((current) => [
      ...current,
      { name: "", amount: "", date: today },
    ])
  }

  function removeIncome(index: number) {
    invalidate()
    setIncomes((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  function removeExpense(index: number) {
    invalidate()
    setExpenses((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    )
  }

  const additionalCashflows = [...incomes, ...expenses]
  const invalidCashflow = additionalCashflows.some(
    (cashflow) =>
      !cashflow.name.trim() ||
      Number(cashflow.amount) <= 0 ||
      !Number.isInteger(Number(cashflow.amount)) ||
      !cashflow.date ||
      cashflow.date < today ||
      cashflow.date > endDate,
  )
  const canAddCashflow = additionalCashflows.length < 20

  async function calculate(event: React.FormEvent) {
    event.preventDefault()
    if (busy || invalidCashflow || !endDate) return
    const request = new AbortController()
    controller.current = request
    compared.current = true
    setBusy(true)
    setError("")
    setResult(null)
    setStale(false)
    try {
      const data = await requestJson<SimulationData>("/api/simulation", {
        ...jsonBody("POST", {
          endDate,
          extraIncomes: incomes,
          extraExpenses: expenses,
        }),
        signal: request.signal,
      })
      if (!request.signal.aborted) setResult(data)
    } catch (reason) {
      if (!request.signal.aborted) setError((reason as Error).message)
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={t("simulation")}
        description={t("simulationDescription")}
      />
      <PageInsights context={{ page: "simulation", input: {
        endDate,
        extraIncomes: incomes.map((item) => ({ amount: Number(item.amount), date: item.date })),
        extraExpenses: expenses.map((item) => ({ amount: Number(item.amount), date: item.date })),
      } }} ready={Boolean(balance.data) && !balance.loading && !balance.refreshing && !balance.error && !invalidCashflow && Boolean(endDate) && endDate >= today} />
      <div className="grid gap-4 lg:grid-cols-3">
        <section
          aria-label={t("currentCash")}
          className="min-w-0 rounded-xl border bg-white p-5"
        >
          <p className="text-sm text-muted-foreground">{t("currentCash")}</p>
          {balance.loading ? (
            <p role="status" className="mt-2 text-lg font-semibold">
              {t("loading")}
            </p>
          ) : balance.data ? (
            <p className="mt-2 break-words text-2xl font-semibold tabular-nums text-brand-active">
              {formatCurrency(balance.data.currentBalance)}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("currentCashHint")}
          </p>
          <div className="mt-3">
            <ErrorNotice message={balance.error} onRetry={balance.reload} />
          </div>
        </section>
        <section
          aria-label={t("currentGrossWorth")}
          className="min-w-0 rounded-xl border bg-white p-5"
        >
          <p className="text-sm text-muted-foreground">
            {t("currentGrossWorth")}
          </p>
          {balance.loading ? (
            <p role="status" className="mt-2 text-lg font-semibold">{t("loading")}</p>
          ) : balance.data ? (
            <p className={`mt-2 break-words text-2xl font-semibold tabular-nums ${balance.data.grossWorth < 0 ? "text-rose-700" : "text-brand-active"}`}>
              {formatCurrency(balance.data.grossWorth)}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("grossWorthDescription")}
          </p>
        </section>
        <section
          aria-label={t("currentNetWorth")}
          className="min-w-0 rounded-xl border bg-white p-5"
        >
          <p className="text-sm text-muted-foreground">
            {t(balance.data?.netWorth === null ? "currentKnownNetWorth" : "currentNetWorth")}
          </p>
          {balance.loading ? (
            <p role="status" className="mt-2 text-lg font-semibold">{t("loading")}</p>
          ) : balance.data ? (
            <p className={`mt-2 break-words text-2xl font-semibold tabular-nums ${balance.data.knownNetWorth < 0 ? "text-rose-700" : "text-brand-active"}`}>
              {formatCurrency(balance.data.knownNetWorth)}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t("netWorthDescription")}
          </p>
          {balance.data?.netWorth === null && (
            <p role="status" className="mt-3 text-sm text-amber-900">
              {t("incompleteNetWorthProjection")}
            </p>
          )}
        </section>
      </div>
      <form
        onSubmit={calculate}
        className="space-y-5 rounded-xl border bg-white p-5"
      >
        <fieldset disabled={busy} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="calculator-end" label={t("simulateUntil")} required>
              <Input
                id="calculator-end"
                type="date"
                min={today}
                max={maximumProjectionDate()}
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value)
                  invalidate()
                }}
                required
              />
            </Field>
          </div>
          <div className="rounded-lg border border-brand-border bg-brand-soft p-4 text-sm leading-relaxed text-foreground">
            {t("calculatorHint")}
            <p className="mt-2">{t("netWorthProjectionHint")}</p>
          </div>
          <PlannedCashflowList
            kind="income"
            entries={incomes}
            today={today}
            endDate={endDate}
            canAdd={canAddCashflow}
            onAdd={addIncome}
            onUpdate={updateIncome}
            onRemove={removeIncome}
          />
          <PlannedCashflowList
            kind="expense"
            entries={expenses}
            today={today}
            endDate={endDate}
            canAdd={canAddCashflow}
            onAdd={addExpense}
            onUpdate={updateExpense}
            onRemove={removeExpense}
          />
          {!canAddCashflow && (
            <p className="text-sm text-muted-foreground">
              {t("simulationItemLimit")}
            </p>
          )}
        </fieldset>
        <ErrorNotice message={error} />
        <Button type="submit" disabled={busy || invalidCashflow || !endDate}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Calculator className="h-4 w-4" aria-hidden="true" />
          )}
          {t(busy ? "calculating" : "calculateExpenses")}
        </Button>
      </form>
      {stale && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("simulationStale")}
        </p>
      )}
      {result && (
        <section className="space-y-5" aria-label={t("monthlyProjection")}>
          <div
            role="status"
            className="rounded-lg border border-brand-border bg-brand-soft p-4 text-sm text-brand-active"
          >
            {t("simulationOnly")}{" "}
            {t("plannedIncomeCount", { count: result.extraIncomeCount })}{" "}
            {t("plannedExpenseCount", { count: result.extraExpenseCount })}
          </div>
          <dl className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 xl:grid-cols-3">
            {[
              [
                "projectedCash",
                result.scenario,
                result.scenario < 0 ? "text-rose-700" : "text-brand-active",
              ],
              ["projectedGrossWorth", result.projectedGrossWorth,
                result.projectedGrossWorth < 0 ? "text-rose-700" : "text-brand-active"],
              [result.projectedNetWorth === null ? "projectedKnownNetWorth" : "projectedNetWorth", result.knownProjectedNetWorth,
                result.knownProjectedNetWorth < 0 ? "text-rose-700" : "text-brand-active"],
              ["currentCash", result.currentBalance, ""],
              ["currentGrossWorth", result.grossWorth,
                result.grossWorth < 0 ? "text-rose-700" : ""],
              [result.netWorth === null ? "currentKnownNetWorth" : "currentNetWorth", result.knownNetWorth,
                result.knownNetWorth < 0 ? "text-rose-700" : ""],
              ["scheduledIncome", result.scheduledIncome, "text-emerald-700"],
              ["addedIncome", result.extraIncome, "text-emerald-700"],
              ["scheduledExpenses", result.scheduledExpense, "text-rose-700"],
              ["addedExpenses", result.extraExpense, "text-rose-700"],
            ].map(([key, value, tone]) => (
              <div key={String(key)} className="min-w-0">
                <dt className="text-sm text-muted-foreground">
                  {t(String(key))}
                </dt>
                <dd
                  className={`mt-2 break-words text-xl font-semibold tabular-nums ${tone}`}
                >
                  {formatCurrency(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("netWorthProjectionHint")}
          </p>
          {result.netWorth === null && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {t("incompleteNetWorthProjection")}
            </p>
          )}
          {result.rows.some((row) => row.scenario < 0) && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
            >
              {t("negativeScenario")}
            </p>
          )}
          <div
            role="region"
            aria-label={t("monthlyProjection")}
            tabIndex={0}
            className="overflow-x-auto rounded-xl border bg-white"
          >
            <table className="w-full min-w-[1080px] text-sm">
              <caption className="sr-only">{t("monthlyProjection")}</caption>
              <thead className="bg-muted/50">
                <tr>
                  {[
                    "period",
                    "income",
                    "addedIncome",
                    "expenses",
                    "addedExpenses",
                    "baseline",
                    "projectedCash",
                    "projectedGrossWorth",
                    result.netWorth === null ? "projectedKnownNetWorth" : "projectedNetWorth",
                  ].map((key, index) => (
                    <th
                      scope="col"
                      key={key}
                      className={`p-3 font-medium text-muted-foreground ${index ? "text-right" : "text-left"}`}
                    >
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.month} className="border-t">
                    <td className="whitespace-nowrap p-3">
                      {formatMonth(row.month)}
                    </td>
                    {[
                      row.income,
                      row.extraIncome,
                      row.expense,
                      row.extraExpense,
                      row.baseline,
                      row.scenario,
                      row.grossWorth,
                      row.knownNetWorth,
                    ].map((amount, index) => (
                      <td
                        key={index}
                        className={`p-3 text-right tabular-nums ${amount < 0 ? "text-rose-700" : ""}`}
                      >
                        {formatCurrency(amount)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
