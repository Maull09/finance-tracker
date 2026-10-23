"use client"

import { useId, useState } from "react"
import { CheckCircle2, Landmark } from "lucide-react"
import { AddAccountForm } from "./accounts-form"
import { RecordDeleteButton } from "./record-delete-button"
import {
  EmptyState,
  ErrorNotice,
  Field,
  LoadingState,
  SubmitButton,
} from "./feedback"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
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
import { jsonBody, requestJson } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import { getToday } from "@/lib/finance"
import type { AccountSummary as Summary } from "@/lib/types"

export function AccountSummary() {
  const { t, formatCurrency } = useLanguage()
  const records = useRemoteData<Summary[]>("/api/accounts/summary")
  if (records.error && !records.data)
    return <ErrorNotice message={records.error} onRetry={records.reload} />
  if (records.loading) return <LoadingState />
  if (!records.data?.length)
    return (
      <EmptyState title={t("startHere")} description={t("startHereHint")}>
        <AddAccountForm />
      </EmptyState>
    )
  return (
    <section aria-labelledby="account-summary-title" className="space-y-3">
      <ErrorNotice message={records.error} onRetry={records.reload} />
      {records.refreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="account-summary-title" className="text-lg font-semibold">
            {t("accountBalance")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("accountsCount", { count: records.data.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AddAccountForm />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {records.data.map((account) => (
          <Card key={account.id} className="py-5">
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-active">
                  <Landmark aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="break-words font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(account.type)}
                  </p>
                </div>
              </div>
              <p
                className={
                  "mt-4 text-xl font-semibold tabular-nums " +
                  (account.balance < 0 ? "text-negative" : "")
                }
              >
                {formatCurrency(account.balance)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-1 border-t pt-3">
                <ReconcileAccount account={account} />
                <AddAccountForm account={account} />
                <RecordDeleteButton
                  url={"/api/accounts/" + account.id}
                  detail={account.name}
                  description="deleteAccountHint"
                  success="accountDeleted"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function ReconcileAccount({ account }: { account: Summary }) {
  const { t, formatCurrency } = useLanguage()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [actual, setActual] = useState("")
  const [difference, setDifference] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  async function reconcile(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    setDifference(null)
    try {
      const result = await requestJson<{ difference: number }>(
        "/api/accounts/" + account.id + "/reconciliations",
        jsonBody("POST", { actualBalance: actual, date: getToday() }),
      )
      setDifference(result.difference)
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
          setDifference(null)
          setError("")
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-primary">
          {t("reconcileBalance")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>
            {t("reconcileBalance")} · {account.name}
          </DialogTitle>
          <DialogDescription>{t("reconcileHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={reconcile} className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs text-muted-foreground">
              {t("recordedBalance")}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatCurrency(account.balance)}
            </p>
          </div>
          <Field id={id} label={t("actualBalance") + " (IDR)"} required>
            <Input
              id={id}
              type="number"
              step="1"
              value={actual}
              onChange={(event) => {
                setActual(event.target.value)
                setDifference(null)
              }}
              disabled={busy}
              required
            />
          </Field>
          <ErrorNotice message={error} />
          {difference !== null && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg bg-brand-soft p-3 text-sm text-brand-active"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {difference === 0
                ? t("balancesMatch")
                : t("balanceDifference", {
                    amount: formatCurrency(difference),
                  })}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t(difference === null ? "cancel" : "done")}
            </Button>
            <SubmitButton busy={busy} disabled={actual === ""}>
              {t("compareBalances")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
