"use client"

import { PageInsights } from "./page-insights"
import { useId, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
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
import { getToday } from "@/lib/finance"
import { CategoryFields } from "./category-fields"
import { useRemoteData } from "@/lib/use-remote-data"
import { requestJson, jsonBody } from "@/lib/client-api"
import type { FundsData, SinkingFund, CashAccount } from "@/lib/planning-types"

export function SinkingFunds() {
  const { t } = useLanguage()
  const records = useRemoteData<FundsData>("/api/sinking-funds")
  const data = records.data
  return (
    <div className="space-y-6">
      <PageHeading title={t("funds")} description={t("fundsDescription")}>
        <FundForm accounts={data?.accounts ?? []} />
      </PageHeading>
      <PageInsights context={{ page: "funds" }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      <ErrorNotice message={records.error} onRetry={records.reload} />
      {records.refreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {records.loading ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              {t("fundHint")}
            </p>
            {!data.accounts.length ? (
              <EmptyState
                title={t("noAccounts")}
                description={t("accountHelp")}
              >
                <AddAccountForm />
              </EmptyState>
            ) : !data.funds.length ? (
              <EmptyState title={t("noFunds")} description={t("noFundsHint")}>
                <FundForm accounts={data.accounts} />
              </EmptyState>
            ) : (
              <div className="grid gap-5 xl:grid-cols-2">
                {data.funds.map((fund) => (
                  <FundCard
                    key={fund.id}
                    fund={fund}
                    accounts={data.accounts}
                  />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}

function FundCard({
  fund,
  accounts,
}: {
  fund: SinkingFund
  accounts: CashAccount[]
}) {
  const { t, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const [deleting, setDeleting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const account = accounts.find((item) => item.id === fund.accountId)
  const percentage = Math.min(
    100,
    Math.round((fund.allocated / fund.targetAmount) * 100),
  )
  async function remove() {
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson("/api/sinking-funds/" + fund.id, { method: "DELETE" })
      setDeleting(false)
      notify("fundDeleted")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold">{fund.name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {account?.name} / {formatDate(fund.targetDate)}
          </p>
          {fund.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {fund.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <FundForm accounts={accounts} fund={fund} />
          <Button
            variant="ghost"
            size="icon"
            disabled={fund.entries.length > 0}
            aria-label={t("delete") + " " + fund.name}
            title={t("fundDeleteHint")}
            onClick={() => {
              setDeleting(true)
              setError("")
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <p>
          <span className="text-muted-foreground">{t("fundAllocation")}: </span>
          <span className="font-semibold tabular-nums">
            {formatCurrency(fund.allocated)}
          </span>
        </p>
        <p className="text-muted-foreground">
          {t("of")} {formatCurrency(fund.targetAmount)}
        </p>
      </div>
      <Progress
        value={percentage}
        aria-label={fund.name + " " + t("progress")}
      />
      <p className="text-sm text-muted-foreground">
        {t("suggestedMonthlySaving")}:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {formatCurrency(fund.monthlySaving)}
        </span>
      </p>
      {fund.targetDate < getToday() && fund.allocated < fund.targetAmount && (
        <p className="text-sm text-warning">{t("overdue")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <FundEntryForm fund={fund} account={account} kind="allocate" />
        <FundEntryForm fund={fund} account={account} kind="release" />
        <FundEntryForm fund={fund} account={account} kind="spend" />
      </div>
      {fund.allocated === 0 && (
        <p className="text-xs text-muted-foreground">{t("fundNoAllocation")}</p>
      )}
      {fund.allocated >= fund.targetAmount ? (
        <p className="text-xs text-brand-active">{t("fundTargetReached")}</p>
      ) : (
        (account?.availableCash ?? 0) <= 0 && (
          <p className="text-xs text-muted-foreground">{t("fundNoCash")}</p>
        )
      )}
      <details className="border-t pt-4">
        <summary className="min-h-11 cursor-pointer rounded py-3 text-sm font-medium">
          {t("fundHistory")}
        </summary>
        {!fund.entries.length ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("noFundHistory")}
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {fund.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p>{t(entry.kind)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(entry.date)}
                    {entry.note && " / " + entry.note}
                  </p>
                </div>
                <span className="font-medium tabular-nums">
                  {entry.kind === "allocate" ? "+" : "−"}
                  {formatCurrency(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </details>
      {fund.entries.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("fundDeleteHint")}</p>
      )}
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        detail={fund.name}
        description={t("fundDeleteHint")}
        busy={busy}
        error={error}
        onConfirm={() => void remove()}
      />
    </section>
  )
}

function FundForm({
  accounts,
  fund,
}: {
  accounts: CashAccount[]
  fund?: SinkingFund
}) {
  const { t } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [date, setDate] = useState("")
  const [account, setAccount] = useState("")
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  function changeOpen(value: boolean) {
    if (busy) return
    setOpen(value)
    setError("")
    if (value && fund) {
      setName(fund.name)
      setAmount(String(fund.targetAmount))
      setDate(fund.targetDate)
      setAccount(String(fund.accountId))
      setDescription(fund.description)
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        fund ? "/api/sinking-funds/" + fund.id : "/api/sinking-funds",
        jsonBody(fund ? "PATCH" : "POST", {
          name,
          targetAmount: amount,
          targetDate: date,
          accountId: account,
          description,
        }),
      )
      setOpen(false)
      if (!fund) {
        setName("")
        setAmount("")
        setDate("")
        setAccount("")
        setDescription("")
      }
      notify("fundSaved")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant={fund ? "ghost" : "default"}
          size={fund ? "sm" : "default"}
          disabled={!accounts.length}
          title={!accounts.length ? t("accountCreateHint") : undefined}
        >
          {!fund && <Plus className="h-4 w-4" />}
          {t(fund ? "edit" : "addFund")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t(fund ? "editFund" : "addFund")}</DialogTitle>
          <DialogDescription>{t("fundHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <Field id={id + "-name"} label={t("fundName")} required>
              <Input
                id={id + "-name"}
                placeholder={t("fundExample")}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field
              id={id + "-account"}
              label={t("fundAccount")}
              hint={fund?.entries.length ? t("fundAccountLocked") : undefined}
              required
            >
              <Select
                value={account}
                onValueChange={setAccount}
                disabled={Boolean(fund?.entries.length)}
                required
              >
                <SelectTrigger
                  id={id + "-account"}
                  aria-describedby={
                    fund?.entries.length ? id + "-account-hint" : undefined
                  }
                >
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
            <Field
              id={id + "-target"}
              label={t("targetAmount") + " (IDR)"}
              required
            >
              <Input
                id={id + "-target"}
                type="number"
                min={Math.max(1, fund?.allocated ?? 0)}
                max="2147483647"
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            <Field id={id + "-date"} label={t("targetDate")} required>
              <Input
                id={id + "-date"}
                type="date"
                min={getToday()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>
            <Field
              id={id + "-description"}
              label={t("description") + " (" + t("optional") + ")"}
            >
              <Input
                id={id + "-description"}
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
                !name.trim() || !account || Number(amount) <= 0 || !date
              }
            >
              {t(fund ? "saveChanges" : "saveFund")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FundEntryForm({
  fund,
  account,
  kind,
}: {
  fund: SinkingFund
  account?: CashAccount
  kind: "allocate" | "release" | "spend"
}) {
  const { t, formatCurrency } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState("")
  const [note, setNote] = useState("")
  const [category, setCategory] = useState("Lainnya")
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const limit =
    kind === "allocate"
      ? Math.max(
          0,
          Math.min(
            fund.targetAmount - fund.allocated,
            account?.availableCash ?? 0,
          ),
        )
      : kind === "spend"
        ? Math.max(0, Math.min(fund.allocated, account?.balance ?? 0))
        : fund.allocated
  const hint =
    kind === "allocate"
      ? "fundAllocateHint"
      : kind === "release"
        ? "fundReleaseHint"
        : "fundSpendHint"
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/sinking-funds/" + fund.id + "/entries",
        jsonBody("POST", { kind, amount, note, category, subcategory }),
      )
      setOpen(false)
      setAmount("")
      setNote("")
      notify("fundEntrySaved")
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
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={limit <= 0}>
          {t(kind)}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t(
              kind === "allocate"
                ? "allocateMoney"
                : kind === "release"
                  ? "releaseMoney"
                  : "spendMoney",
            )}{" "}
            / {fund.name}
          </DialogTitle>
          <DialogDescription>{t(hint)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("fundAccount")}: {account?.name}
            </p>
            <Field
              id={id + "-amount"}
              label={t("amountIdr")}
              hint={t("remainingAmount", { amount: formatCurrency(limit) })}
              required
            >
              <Input
                id={id + "-amount"}
                type="number"
                min="1"
                max={limit}
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            {kind === "spend" && (
              <CategoryFields id={id} type="expense" category={category} subcategory={subcategory}
                onChange={(category, subcategory) => { setCategory(category); setSubcategory(subcategory) }} />
            )}
            <Field id={id + "-note"} label={t("note")}>
              <Input
                id={id + "-note"}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
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
              disabled={Number(amount) <= 0 || Number(amount) > limit}
            >
              {t(kind)}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
