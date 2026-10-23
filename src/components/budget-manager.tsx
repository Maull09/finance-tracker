"use client"

import { MonthPicker } from "./month-picker"

import { PageInsights } from "./page-insights"
import { useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { RecordDeleteButton } from "./record-delete-button"
import { useLanguage } from "./language-provider"
import {
  EmptyState,
  ErrorNotice,
  Field,
  LoadingState,
  PageHeading,
  SubmitButton,
  useFeedback,
} from "./feedback"
import { Button } from "./ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Input } from "./ui/input"
import { Progress } from "./ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { expenseCategories, getCurrentMonth } from "@/lib/finance"
import { jsonBody, requestJson } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import type { Budget } from "@/lib/types"

export function BudgetManager() {
  const { t, formatCurrency, formatMonth } = useLanguage()
  const notify = useFeedback()
  const [month, setMonth] = useState(getCurrentMonth())
  const records = useRemoteData<Budget[]>("/api/budgets?month=" + month)
  const budgets = records.data ?? []
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Budget | null>(null)
  const [category, setCategory] = useState("")
  const [amount, setAmount] = useState("")
  const [rollover, setRollover] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const total = budgets.reduce(
    (sum, budget) => sum + (budget.effectiveBudget ?? budget.budget),
    0,
  )
  const spent = budgets.reduce((sum, budget) => sum + budget.spent, 0)

  async function saveBudget(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/budgets" + (editing ? "/" + editing.id : ""),
        jsonBody(editing ? "PATCH" : "POST", {
          category,
          budget: amount,
          periodStart: month,
          rolloverEnabled: rollover,
        }),
      )
      setOpen(false)
      setCategory("")
      setAmount("")
      setRollover(false)
      notify(editing ? "budgetUpdated" : "budgetSaved")
      setEditing(null)
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const add = (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value)
          setError("")
          if (!value) setEditing(null)
          if (value && !editing) {
            setCategory("")
            setAmount("")
            setRollover(false)
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={records.loading || Boolean(records.error)}>
          <Plus className="h-4 w-4" />
          {t("addBudget")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {t(editing ? "editBudget" : "addBudget")} · {formatMonth(month)}
          </DialogTitle>
          <DialogDescription>
            {t(editing ? "editBudgetHint" : "noBudgetHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={saveBudget} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <Field id="budget-category" label={t("category")} required>
              <Select value={category} onValueChange={setCategory} required>
                <SelectTrigger id="budget-category">
                  <SelectValue placeholder={t("chooseCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories
                    .filter(
                      (item) =>
                        !budgets.some(
                          (budget) =>
                            budget.category === item &&
                            budget.id !== editing?.id,
                        ),
                    )
                    .map((item) => (
                      <SelectItem key={item} value={item}>
                        {t(item)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="budget-amount"
              label={t("budgetLimit") + " (IDR)"}
              hint={t("amountHint")}
              required
            >
              <Input
                id="budget-amount"
                aria-describedby="budget-amount-hint"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            <label className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm leading-relaxed">
              <input
                className="mt-1 accent-brand"
                type="checkbox"
                checked={rollover}
                onChange={(event) => setRollover(event.target.checked)}
              />
              {t("rollover")}
            </label>
          </fieldset>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setOpen(false)
                setEditing(null)
              }}
            >
              {t("cancel")}
            </Button>
            <SubmitButton
              busy={busy}
              disabled={!category || Number(amount) <= 0}
            >
              {t(editing ? "saveChanges" : "saveBudget")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )

  return (
    <div className="space-y-6">
      <PageHeading
        title={t("budgetTitle")}
        description={t("budgetDescription")}
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field id="budget-month" label={t("period")}>
            <MonthPicker
              id="budget-month"
              value={month}
              onChange={setMonth}
            />
          </Field>
          {add}
        </div>
      </PageHeading>
      <PageInsights context={{ page: "budget", month }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      <ErrorNotice message={records.error} onRetry={records.reload} />
      {records.refreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {records.error && !records.data ? null : records.loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["totalBudget", total],
              ["spent", spent],
              ["remaining", total - spent],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg border bg-card p-4"
              >
                <p className="text-xs text-muted-foreground">
                  {t(String(label))}
                </p>
                <p
                  className={
                    "mt-2 text-xl font-semibold tabular-nums " +
                    (Number(value) < 0 ? "text-negative" : "")
                  }
                >
                  {formatCurrency(Number(value))}
                </p>
              </div>
            ))}
          </div>
          {budgets.length === 0 ? (
            <EmptyState
              title={t("noBudget", { month: formatMonth(month) })}
              description={t("noBudgetHint")}
            >
              <Button
                onClick={() => setOpen(true)}
                disabled={Boolean(records.error)}
              >
                {t("addBudget")}
              </Button>
            </EmptyState>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {budgets.map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  onEdit={() => {
                    setEditing(budget)
                    setCategory(budget.category)
                    setAmount(String(budget.budget))
                    setRollover(Boolean(budget.rolloverEnabled))
                    setError("")
                    setOpen(true)
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function BudgetCard({
  budget,
  onEdit,
}: {
  budget: Budget
  onEdit: () => void
}) {
  const { t, formatCurrency } = useLanguage()
  const effective = budget.effectiveBudget ?? budget.budget
  const percentage =
    effective > 0 ? Math.round((budget.spent / effective) * 100) : 0
  const tone =
    budget.spent > effective
      ? "text-negative"
      : percentage >= 80
        ? "text-warning"
        : "text-brand-active"
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t(budget.category)}</CardTitle>
          <span className={"text-xs font-semibold " + tone}>
            {t(
              budget.spent > effective
                ? "overLimit"
                : budget.spent === effective
                  ? "budgetAtLimit"
                  : percentage >= 80
                    ? "nearlyUsed"
                    : "onTrack",
            )}{" "}
            · {percentage}%
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress
          value={Math.min(percentage, 100)}
          aria-label={t(budget.category) + " " + t("progress")}
          className="h-2"
        />
        <div className="flex justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t("spent")} {formatCurrency(budget.spent)}
          </span>
          <span>
            {t("of")} {formatCurrency(effective)}
          </span>
        </div>
        {(budget.carryover ?? 0) > 0 && (
          <p className="text-xs text-primary">
            {t("includesRollover", {
              amount: formatCurrency(budget.carryover ?? 0),
            })}
          </p>
        )}
        <p className={"text-sm font-medium " + tone}>
          {t(budget.spent > effective ? "overBy" : "remainingAmount", {
            amount: formatCurrency(Math.abs(effective - budget.spent)),
          })}
        </p>
        <div className="flex flex-wrap gap-1 border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            aria-label={t("edit") + " " + t(budget.category)}
          >
            <Pencil className="h-4 w-4" />
            {t("edit")}
          </Button>
          <RecordDeleteButton
            url={"/api/budgets/" + budget.id}
            detail={t(budget.category)}
            description="deleteBudgetHint"
            success="budgetDeleted"
          />
        </div>
      </CardContent>
    </Card>
  )
}
