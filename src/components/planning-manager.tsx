"use client"

import { PageInsights } from "./page-insights"
import { useEffect, useState } from "react"
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react"
import { useLanguage } from "./language-provider"
import { AddAccountForm } from "./accounts-form"
import {
  ConfirmDelete,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { getToday } from "@/lib/finance"
import { nextPendingOccurrence } from "@/lib/planning"
import { RecordOccurrence } from "./record-occurrence"
import { CategoryFields } from "./category-fields"
import { requestJson, jsonBody } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import type { Account } from "@/lib/types"

type Recurring = {
  id: number
  name: string
  type: "income" | "expense" | "transfer"
  amount: number
  category: string
  subcategory: string | null
  accountId: number
  frequency: "weekly" | "monthly"
  startDate: string
  endDate: string | null
  destinationAccountId: number | null
  description: string | null
  lastExecutedDate: string | null
  recordedThroughDate: string | null
  recordedDates: string[]
}
type Forecast = {
  payday: string
  currentBalance: number
  forecastBalance: number
  scheduled: Recurring[]
}

export function PlanningManager() {
  const { t, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const records = useRemoteData<Recurring[]>("/api/recurring")
  const accountData = useRemoteData<Account[]>("/api/accounts")
  const accounts = accountData.data ?? []
  const [payday, setPayday] = useState(getToday())
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [forecastBusy, setForecastBusy] = useState(false)
  const [forecastError, setForecastError] = useState("")
  const [deleting, setDeleting] = useState<Recurring | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const invalidate = () => setForecast(null)
    window.addEventListener("finance-data-changed", invalidate)
    return () => window.removeEventListener("finance-data-changed", invalidate)
  }, [])

  async function calculate(event: React.FormEvent) {
    event.preventDefault()
    if (forecastBusy) return
    setForecastBusy(true)
    setForecastError("")
    setForecast(null)
    try {
      setForecast(await requestJson<Forecast>("/api/forecast?payday=" + payday))
    } catch (reason) {
      setForecastError((reason as Error).message)
    } finally {
      setForecastBusy(false)
    }
  }
  async function deleteSchedule() {
    const item = deleting
    if (!item || busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/recurring/" + item.id,
        { method: "DELETE" },
      )
      notify("scheduleDeleted")
      setDeleting(null)
      setForecast(null)
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        title={t("planningTitle")}
        description={t("planningDescription")}
      >
        <AddSchedule accounts={accounts} />
      </PageHeading>
      <PageInsights context={{ page: "planning", endDate: payday }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error && Boolean(payday) && payday >= getToday()} />
      <Card>
        <CardHeader>
          <CardTitle>{t("forecastTitle")}</CardTitle>
          <CardDescription>{t("forecastDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={calculate}
            className="flex flex-col items-start gap-3 sm:flex-row sm:items-end"
          >
            <Field id="forecast-payday" label={t("payDay")} required>
              <Input
                id="forecast-payday"
                type="date"
                min={getToday()}
                value={payday}
                onChange={(event) => {
                  setPayday(event.target.value)
                  setForecast(null)
                }}
                disabled={forecastBusy}
                required
              />
            </Field>
            <SubmitButton
              busy={forecastBusy}
              busyLabel="calculating"
              disabled={!payday || payday < getToday()}
            >
              {t("calculateForecast")}
            </SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">{t("forecastHint")}</p>
          <ErrorNotice message={forecastError} />
          {forecast && (
            <div
              role="status"
              className="rounded-lg border border-brand-border bg-brand-soft p-5"
            >
              <p className="text-sm text-brand-active">
                {t("estimatedBalance", { date: formatDate(forecast.payday) })}
              </p>
              <p
                className={
                  "mt-2 text-3xl font-semibold tabular-nums " +
                  (forecast.forecastBalance < 0
                    ? "text-negative"
                    : "text-foreground")
                }
              >
                {formatCurrency(forecast.forecastBalance)}
              </p>
              <p className="mt-3 text-xs text-brand-active">
                {t("currentBalance", {
                  amount: formatCurrency(forecast.currentBalance),
                })}{" "}
                · {t("schedulesIncluded", { count: forecast.scheduled.length })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      {(records.error || accountData.error) && (
        <ErrorNotice
          message={records.error || accountData.error}
          onRetry={() => {
            records.reload()
            accountData.reload()
          }}
        />
      )}
      {(records.refreshing || accountData.refreshing) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {!accountData.loading && !accountData.error && accounts.length === 0 && (
        <EmptyState
          title={t("noAccounts")}
          description={t("accountCreateHint")}
        >
          <AddAccountForm />
        </EmptyState>
      )}
      {(records.error && !records.data) ||
      (accountData.error && !accountData.data) ? null : records.loading ||
        accountData.loading ? (
        <LoadingState />
      ) : !records.data?.length ? (
        <EmptyState title={t("noSchedules")} description={t("noSchedulesHint")}>
          {accounts.length > 0 && <AddSchedule accounts={accounts} />}
        </EmptyState>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("activeSchedules")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {records.data.map((item) => {
                const occurrence = nextPendingOccurrence(item, getToday())
                return (
                  <li
                    key={item.id}
                    className="flex flex-col justify-between gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                  >
                    <div className="flex items-start gap-3">
                      <CalendarClock className="mt-1 h-5 w-5 shrink-0 text-brand-active" />
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t(item.category)}{item.subcategory ? " / " + t(item.subcategory) : ""}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t(item.type)} · {formatCurrency(item.amount)} ·{" "}
                          {t(item.frequency)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {
                            accounts.find(
                              (account) => account.id === item.accountId,
                            )?.name
                          }{" "}
                          · {t("starts")} {formatDate(item.startDate)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.lastExecutedDate
                            ? t("lastRecorded") +
                              ": " +
                              formatDate(item.lastExecutedDate)
                            : t("notRecorded")}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AddSchedule accounts={accounts} schedule={item} />
                      {occurrence ? (
                        <RecordOccurrence occurrence={occurrence} chooseScheduledDate
                          accountName={accounts.find((account) => account.id === item.accountId)?.name} />
                      ) : <Button variant="outline" disabled>{t("noPendingOccurrences")}</Button>}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("delete") + " " + item.name}
                        onClick={() => {
                          setDeleting(item)
                          setError("")
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      <ConfirmDelete
        open={Boolean(deleting)}
        onOpenChange={(value) => {
          if (!value) setDeleting(null)
        }}
        detail={
          deleting
            ? deleting.name + " · " + formatCurrency(deleting.amount)
            : ""
        }
        description={t("deleteScheduleHint")}
        busy={busy}
        error={error}
        onConfirm={() => void deleteSchedule()}
      />
    </div>
  )
}

function AddSchedule({
  accounts,
  schedule,
}: {
  accounts: Account[]
  schedule?: Recurring
}) {
  const { t } = useLanguage()
  const notify = useFeedback()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<Recurring["type"]>("expense")
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState("")
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [accountId, setAccountId] = useState("")
  const [frequency, setFrequency] = useState<"weekly" | "monthly">("monthly")
  const [startDate, setStartDate] = useState(getToday())
  const [endDate, setEndDate] = useState("")
  const [destinationAccountId, setDestinationAccountId] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/recurring" + (schedule ? "/" + schedule.id : ""),
        jsonBody(schedule ? "PATCH" : "POST", {
          name,
          type,
          amount,
          category,
          subcategory,
          accountId,
          frequency,
          startDate,
          endDate,
          destinationAccountId:
            type === "transfer" ? destinationAccountId : null,
          description,
        }),
      )
      setOpen(false)
      setName("")
      setAmount("")
      setCategory("")
      setSubcategory(null)
      setAccountId("")
      setDescription("")
      setEndDate("")
      setDestinationAccountId("")
      notify(schedule ? "scheduleUpdated" : "scheduleSaved")
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
          if (value && schedule) {
            setName(schedule.name)
            setType(schedule.type)
            setAmount(String(schedule.amount))
            setCategory(schedule.category)
            setSubcategory(schedule.subcategory)
            setAccountId(String(schedule.accountId))
            setFrequency(schedule.frequency)
            setStartDate(schedule.startDate)
            setEndDate(schedule.endDate ?? "")
            setDestinationAccountId(
              schedule.destinationAccountId
                ? String(schedule.destinationAccountId)
                : "",
            )
            setDescription(schedule.description ?? "")
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={accounts.length === 0}
          title={accounts.length === 0 ? t("accountCreateHint") : undefined}
          variant={schedule ? "ghost" : "default"}
          size={schedule ? "sm" : "default"}
          aria-label={schedule ? t("edit") + " " + schedule.name : undefined}
        >
          {schedule ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t(schedule ? "edit" : "addRecurring")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(schedule ? "editSchedule" : "addRecurring")}
          </DialogTitle>
          <DialogDescription>
            {t(schedule ? "editScheduleHint" : "recurringDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Field id="schedule-name" label={t("name")} required>
              <Input
                id="schedule-name"
                placeholder={t("scheduleName")}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field id="schedule-amount" label={t("amountIdr")} required>
              <Input
                id="schedule-amount"
                type="number"
                min="1"
                max="2147483647"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            <Field id="schedule-type" label={t("type")} required>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as Recurring["type"])
                  setCategory(value === "transfer" ? "Transfer" : "")
                  setSubcategory(null)
                }}
              >
                <SelectTrigger id="schedule-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t("income")}</SelectItem>
                  <SelectItem value="expense">{t("expense")}</SelectItem>
                  <SelectItem value="transfer" disabled={accounts.length < 2}>
                    {t("transfer")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {type !== "transfer" && (
              <CategoryFields id="schedule" type={type} category={category} subcategory={subcategory}
                onChange={(category, subcategory) => { setCategory(category); setSubcategory(subcategory) }} />
            )}
            <Field id="schedule-account" label={t("account")} required>
              <Select
                value={accountId}
                onValueChange={(value) => {
                  setAccountId(value)
                  if (value === destinationAccountId)
                    setDestinationAccountId("")
                }}
                required
              >
                <SelectTrigger id="schedule-account">
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
            {type === "transfer" && (
              <Field
                id="schedule-destination"
                label={t("destinationAccount")}
                required
              >
                <Select
                  value={destinationAccountId}
                  onValueChange={setDestinationAccountId}
                  required
                >
                  <SelectTrigger id="schedule-destination">
                    <SelectValue placeholder={t("chooseAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((item) => String(item.id) !== accountId)
                      .map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field id="schedule-frequency" label={t("frequency")} required>
              <Select
                value={frequency}
                onValueChange={(value) =>
                  setFrequency(value as "weekly" | "monthly")
                }
              >
                <SelectTrigger id="schedule-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("monthly")}</SelectItem>
                  <SelectItem value="weekly">{t("weekly")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="schedule-date" label={t("startDate")} required>
              <Input
                id="schedule-date"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
              />
            </Field>
            <Field
              id="schedule-end"
              label={t("endDate") + " (" + t("optional") + ")"}
            >
              <Input
                id="schedule-end"
                type="date"
                min={startDate}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </Field>
            <Field id="schedule-note" label={t("note")}>
              <Input
                id="schedule-note"
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
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
              disabled={
                !name.trim() ||
                !category ||
                !accountId ||
                Number(amount) <= 0 ||
                (type === "transfer" &&
                  (!destinationAccountId ||
                    destinationAccountId === accountId)) ||
                Boolean(endDate && endDate < startDate)
              }
            >
              {t(schedule ? "saveChanges" : "saveSchedule")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
