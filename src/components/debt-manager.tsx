"use client"

import { PageInsights } from "./page-insights"
import { useId, useState } from "react"
import { AddDebtForm, type Debt } from "./debt-form"
import { RecordDeleteButton } from "./record-delete-button"
import { FinancialHistory } from "./financial-history"
import {
  EmptyState,
  ErrorNotice,
  Field,
  LoadingState,
  PageHeading,
  SubmitButton,
  useFeedback,
} from "./feedback"
import { useLanguage } from "./language-provider"
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
import { requestJson, jsonBody } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import type { Account } from "@/lib/types"

export function DebtManager() {
  const { t } = useLanguage()
  const records = useRemoteData<Debt[]>("/api/debts")
  const accounts = useRemoteData<Account[]>("/api/accounts")
  return (
    <div className="space-y-6">
      <PageHeading title={t("debtsTitle")} description={t("debtsDescription")}>
        <AddDebtForm />
      </PageHeading>
      <PageInsights context={{ page: "debts" }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      {(records.error || accounts.error) && (
        <ErrorNotice
          message={records.error || accounts.error}
          onRetry={() => {
            records.reload()
            accounts.reload()
          }}
        />
      )}
      {(records.refreshing || accounts.refreshing) && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {(records.error && !records.data) ||
      (accounts.error && !accounts.data) ? null : records.loading ||
        accounts.loading ? (
        <LoadingState />
      ) : !records.data?.length ? (
        <EmptyState title={t("noDebts")} description={t("noDebtsHint")}>
          <AddDebtForm />
        </EmptyState>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {records.data.map((debt) => (
            <DebtCard
              key={debt.id}
              debt={debt}
              accounts={accounts.data ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DebtCard({ debt, accounts }: { debt: Debt; accounts: Account[] }) {
  const { t, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [account, setAccount] = useState("")
  const [date, setDate] = useState(getToday())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const remaining = Math.max(0, debt.amount - debt.paidAmount)
  async function pay(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/debts/" + debt.id + "/payments",
        jsonBody("POST", { amount, accountId: account, date }),
      )
      setOpen(false)
      setAmount("")
      notify("paymentSaved")
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
              {t(debt.type === "utang" ? "debtTo" : "receivableFrom")}{" "}
              {debt.name}
            </CardTitle>
            {debt.description && (
              <CardDescription className="mt-2">
                {debt.description}
              </CardDescription>
            )}
          </div>
          <span
            className={
              "shrink-0 rounded-md px-2 py-1 text-xs font-medium " +
              (debt.status === "paid"
                ? "bg-brand-soft text-brand-active"
                : "bg-warning-soft text-warning")
            }
          >
            {t(debt.status)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            ["total", debt.amount],
            ["paidAmount", debt.paidAmount],
            ["remaining", remaining],
          ].map(([key, value]) => (
            <div key={String(key)}>
              <dt className="text-xs text-muted-foreground">
                {t(String(key))}
              </dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {formatCurrency(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
        {debt.dueDate && (
          <p className="text-xs text-muted-foreground">
            {t("dueDate")}: {formatDate(debt.dueDate)}
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
                {t("recordPayment")}
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={!busy}>
              <DialogHeader>
                <DialogTitle>
                  {t("recordPayment")} · {debt.name}
                </DialogTitle>
                <DialogDescription>{t("paidHint")}</DialogDescription>
              </DialogHeader>
              <form onSubmit={pay} className="space-y-4">
                <Field
                  id={id + "-amount"}
                  label={t("paymentAmount") + " (IDR)"}
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
                </Field>
                <Field
                  id={id + "-account"}
                  label={t("paymentAccount")}
                  required
                >
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
                <Field id={id + "-date"} label={t("date")} required>
                  <Input
                    id={id + "-date"}
                    type="date"
                    max={getToday()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    disabled={busy}
                    required
                  />
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
                    {t("savePayment")}
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
          <AddDebtForm debt={debt} />
          <FinancialHistory
            url={"/api/debts/" + debt.id + "/payments"}
            title="paymentHistory"
            detail={debt.name}
            accounts={accounts}
          />
          <RecordDeleteButton
            url={"/api/debts/" + debt.id}
            detail={debt.name}
            description="deleteDebtHint"
            success="debtDeleted"
          />
        </div>
      </CardContent>
    </Card>
  )
}
