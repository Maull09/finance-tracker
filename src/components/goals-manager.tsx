"use client"

import { PageInsights } from "./page-insights"
import { useId, useState } from "react"
import { Pencil, Plus, Target } from "lucide-react"
import { RecordDeleteButton } from "./record-delete-button"
import { FinancialHistory } from "./financial-history"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"
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
import { Textarea } from "./ui/textarea"
import { Progress } from "./ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { getToday } from "@/lib/finance"
import { requestJson, jsonBody } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import type { Account } from "@/lib/types"

type Goal = {
  id: number
  title: string
  description: string
  targetAmount: number
  currentAmount: number
  targetDate: string
  category: string
}

export function GoalsManager() {
  const { t, formatCurrency } = useLanguage()
  const goals = useRemoteData<Goal[]>("/api/goals")
  const accounts = useRemoteData<Account[]>("/api/accounts")
  const items = goals.data ?? []
  const summary = [
    { label: "totalGoals", value: String(items.length) },
    {
      label: "completedGoals",
      value: String(
        items.filter((goal) => goal.currentAmount >= goal.targetAmount).length,
      ),
    },
    {
      label: "totalTarget",
      value: formatCurrency(
        items.reduce((total, goal) => total + goal.targetAmount, 0),
      ),
    },
    {
      label: "totalSaved",
      value: formatCurrency(
        items.reduce((total, goal) => total + goal.currentAmount, 0),
      ),
    },
  ]
  return (
    <div className="space-y-6">
      <PageHeading title={t("goalsTitle")} description={t("goalsDescription")}>
        <AddGoal />
      </PageHeading>
      <PageInsights context={{ page: "goals" }} ready={Boolean(goals.data) && !goals.loading && !goals.refreshing && !goals.error} />
      {(goals.error || accounts.error) && (
        <ErrorNotice
          message={goals.error || accounts.error}
          onRetry={() => {
            goals.reload()
            accounts.reload()
          }}
        />
      )}
      {(goals.refreshing || accounts.refreshing) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {(goals.error && !goals.data) ||
      (accounts.error && !accounts.data) ? null : goals.loading ||
        accounts.loading ? (
        <LoadingState />
      ) : !items.length ? (
        <EmptyState title={t("noGoals")} description={t("noGoalsHint")}>
          <AddGoal />
        </EmptyState>
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className="rounded-lg border bg-card p-4">
                <dt className="text-xs text-muted-foreground">
                  {t(item.label)}
                </dt>
                <dd className="mt-2 text-xl font-semibold tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                accounts={accounts.data ?? []}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AddGoal({ goal }: { goal?: Goal } = {}) {
  const { t } = useLanguage()
  const notify = useFeedback()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [target, setTarget] = useState("")
  const [date, setDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/goals" + (goal ? "/" + goal.id : ""),
        jsonBody(goal ? "PATCH" : "POST", {
          title,
          description,
          targetAmount: Number(target),
          targetDate: date,
          category: goal?.category ?? "other",
        }),
      )
      setOpen(false)
      setTitle("")
      setDescription("")
      setTarget("")
      setDate("")
      notify(goal ? "goalUpdated" : "goalSaved")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value)
          setError("")
          if (value && goal) {
            setTitle(goal.title)
            setDescription(goal.description ?? "")
            setTarget(String(goal.targetAmount))
            setDate(goal.targetDate)
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={goal ? "ghost" : "default"}
          size={goal ? "sm" : "default"}
          aria-label={goal ? t("edit") + " " + goal.title : undefined}
        >
          {goal ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {t(goal ? "edit" : "addGoal")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t(goal ? "editGoal" : "addGoal")}</DialogTitle>
          <DialogDescription>
            {t(goal ? "editGoalHint" : "requiredHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <Field id="goal-title" label={t("goalName")} required>
              <Input
                id="goal-title"
                placeholder={t("goalExample")}
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </Field>
            <Field
              id="goal-description"
              label={t("description") + " (" + t("optional") + ")"}
            >
              <Textarea
                id="goal-description"
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field
              id="goal-target"
              label={t("targetAmount") + " (IDR)"}
              required
            >
              <Input
                id="goal-target"
                type="number"
                min={Math.max(1, goal?.currentAmount ?? 0)}
                max="2147483647"
                step="1"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                required
              />
            </Field>
            <Field id="goal-date" label={t("targetDate")} required>
              <Input
                id="goal-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>
          </fieldset>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <SubmitButton
              busy={busy}
              disabled={!title.trim() || Number(target) <= 0 || !date}
            >
              {t(goal ? "saveChanges" : "saveGoal")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GoalCard({ goal, accounts }: { goal: Goal; accounts: Account[] }) {
  const { t, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0)
  const percentage = Math.round((goal.currentAmount / goal.targetAmount) * 100)
  const days = Math.round(
    (Date.parse(goal.targetDate) - Date.parse(getToday())) / 86400000,
  )
  const status =
    remaining === 0
      ? "completed"
      : days < 0
        ? "overdue"
        : days < 30
          ? "urgent"
          : "active"
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [account, setAccount] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function contribute(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/goals/" + goal.id + "/contributions",
        jsonBody("POST", {
          amount: Number(amount),
          accountId: Number(account),
        }),
      )
      setOpen(false)
      setAmount("")
      notify("contributionSaved")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="break-words">
              <Target className="mr-2 inline h-4 w-4 text-brand-active" />
              {goal.title}
            </CardTitle>
            {goal.description && (
              <CardDescription className="mt-2">
                {goal.description}
              </CardDescription>
            )}
          </div>
          <span
            className={
              "shrink-0 rounded-md px-2 py-1 text-xs font-medium " +
              (status === "overdue"
                ? "bg-negative-soft text-negative"
                : status === "urgent"
                  ? "bg-warning-soft text-warning"
                  : "bg-brand-soft text-brand-active")
            }
          >
            {t(status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span className="font-semibold tabular-nums">
            {formatCurrency(goal.currentAmount)}
          </span>
          <span className="text-muted-foreground">
            {t("of")} {formatCurrency(goal.targetAmount)}
          </span>
        </div>
        <Progress
          value={Math.min(100, percentage)}
          aria-label={goal.title + " " + t("progress")}
          className="h-2"
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {t("progress")}: {percentage}%
          </span>
          <span>
            {t("targetDate")}: {formatDate(goal.targetDate)}
          </span>
        </div>
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground">
            {t(days < 0 ? "daysOverdue" : "daysLeft", {
              count: Math.abs(days),
            })}{" "}
            · {t("remainingAmount", { amount: formatCurrency(remaining) })}
          </p>
        )}
        {remaining > 0 && (
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!busy) {
                setOpen(value)
                setError("")
              }
            }}
          >
            <DialogTrigger asChild>
              <Button variant="outline" disabled={accounts.length === 0}>
                {t("contribute")}
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={!busy}>
              <DialogHeader>
                <DialogTitle>
                  {t("contribution")} · {goal.title}
                </DialogTitle>
                <DialogDescription>{t("contributionHint")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={contribute} className="space-y-4">
                <Field
                  id={id + "-amount"}
                  label={t("contributeAmount")}
                  hint={t("remainingAmount", {
                    amount: formatCurrency(remaining),
                  })}
                  required
                >
                  <Input
                    id={id + "-amount"}
                    type="number"
                    min="1"
                    max={remaining}
                    step="1"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={busy}
                    required
                  />
                  <div
                    role="group"
                    aria-label={t("goalQuickAmount")}
                    className="flex flex-wrap gap-2"
                  >
                    {[
                      ...new Set(
                        [100000, 500000, 1000000].map((value) =>
                          Math.min(value, remaining),
                        ),
                      ),
                    ].map((value) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setAmount(String(value))}
                      >
                        {formatCurrency(value)}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field id={id + "-account"} label={t("sourceAccount")} required>
                  <Select
                    value={account}
                    onValueChange={setAccount}
                    disabled={busy}
                    required
                  >
                    <SelectTrigger id={id + "-account"}>
                      <SelectValue placeholder={t("chooseAccount")} />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <ErrorNotice message={error} />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                  >
                    {t("cancel")}
                  </Button>
                  <SubmitButton
                    busy={busy}
                    disabled={
                      !account ||
                      Number(amount) <= 0 ||
                      Number(amount) > remaining
                    }
                  >
                    {t("contribute")}
                  </SubmitButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
        {remaining > 0 && accounts.length === 0 && (
          <p className="text-xs text-warning">{t("addAnAccountFirst")}</p>
        )}
        <div className="flex flex-wrap gap-1 border-t pt-3">
          <AddGoal goal={goal} />
          <FinancialHistory
            url={"/api/goals/" + goal.id + "/contributions"}
            title="contributionHistory"
            detail={goal.title}
            accounts={accounts}
          />
          <RecordDeleteButton
            url={"/api/goals/" + goal.id}
            detail={goal.title}
            description="deleteGoalHint"
            success="goalDeleted"
          />
        </div>
      </CardContent>
    </Card>
  )
}
