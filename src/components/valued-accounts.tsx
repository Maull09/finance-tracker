"use client"

import { useId, useState } from "react"
import { Banknote, Coins, History, Pencil, Plus, RefreshCw } from "lucide-react"
import { assetMarketValue, assetSymbols, formatAssetQuantity, parseAssetQuantity, quantityPlaces, type AssetSymbol, type ValuedAccount, type ValuedAccountsData } from "@/lib/valued-assets"
import { getToday, isDate } from "@/lib/finance"
import { jsonBody, requestJson } from "@/lib/client-api"
import { useRemoteData } from "@/lib/use-remote-data"
import { useLanguage } from "./language-provider"
import { EmptyState, ErrorNotice, Field, LoadingState, SubmitButton, useFeedback } from "./feedback"
import { RecordDeleteButton } from "./record-delete-button"
import { AssetRateAttribution } from "./asset-rate-attribution"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"

function symbolLabel(symbol: AssetSymbol, locale: string, gold: string) {
  return symbol === "XAU" ? gold : symbol + " (" + new Intl.DisplayNames([locale], { type: "currency" }).of(symbol) + ")"
}

export function ValuedAccounts() {
  const { t, locale, formatCurrency } = useLanguage()
  const records = useRemoteData<ValuedAccountsData>("/api/valued-accounts")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [status, setStatus] = useState("")
  async function refresh() {
    if (busy) return
    setBusy(true); setError(""); setStatus("")
    try {
      const result = await requestJson<{ updated: number; failures: Array<{ code: string }> }>("/api/asset-rates/refresh", { method: "POST" })
      if (result.failures.length) setError(result.failures[0].code)
      else setStatus(result.updated ? "assetRatesUpdated" : "assetRatesCurrent")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  const data = records.data
  return <section aria-labelledby="valued-accounts-title" className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="valued-accounts-title" className="text-lg font-semibold">{t("valuedAccountsTitle")}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("valuedAccountsHint")}</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refresh()} disabled={busy || !data?.accounts.length}>
        <RefreshCw aria-hidden="true" className={"size-4 " + (busy ? "animate-spin" : "")} />{t(busy ? "refreshing" : "refreshAssetRates")}</Button><ValuedAccountForm /></div>
    </div>
    <ErrorNotice message={records.error || error} onRetry={records.error ? records.reload : () => void refresh()} />
    {status && <p role="status" className="text-sm text-brand-active">{t(status)}</p>}
    {records.loading ? <LoadingState /> : data && <>
      {data.accounts.length > 0 && <div className="rounded-xl border bg-card p-4">
        <p className="text-xs text-muted-foreground">{t(data.totals.unpricedCount ? "assetKnownValue" : "assetTotalValue")}</p>
        <p className="mt-1 break-words text-2xl font-semibold tabular-nums">{formatCurrency(data.totals.knownValue)}</p>
        {data.totals.unpricedCount > 0 && <p role="status" className="mt-2 text-sm text-warning">{t("assetQuotesIncomplete")}</p>}
        {data.totals.staleCount > 0 && <p role="status" className="mt-2 text-sm text-warning">{t("assetQuotesStale")}</p>}
      </div>}
      {!data.accounts.length ? <EmptyState title={t("noValuedAccounts")} description={t("valuedAccountStartHint")} /> :
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.accounts.map((account) => {
          const rate = account.rate
          const rateText = rate ? new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-US", { style: "currency", currency: "IDR", minimumFractionDigits: 0, maximumFractionDigits: 8 }).format(rate.idrRate) : ""
          const quoteDate = rate ? new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(rate.observedAt)) : ""
          return <Card key={account.id} className="py-5"><CardContent>
            <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-active">
              {account.symbol === "XAU" ? <Coins aria-hidden="true" className="size-5" /> : <Banknote aria-hidden="true" className="size-5" />}</span>
              <div className="min-w-0"><p className="break-words font-medium">{account.name}</p><p className="text-xs text-muted-foreground">{symbolLabel(account.symbol, locale, t("goldBalance"))}</p></div></div>
            <p className="mt-4 break-words text-xl font-semibold tabular-nums">{formatAssetQuantity(account.quantity, account.symbol, locale)}</p>
            <p className="mt-2 text-xs text-muted-foreground">{t("assetEstimatedValue")}</p>
            <p className="mt-1 break-words text-lg font-semibold tabular-nums text-brand-active">{account.marketValue === null ? t("unpriced") : formatCurrency(account.marketValue)}</p>
            {rate && <div className="mt-3 space-y-1 text-xs text-muted-foreground"><p className="break-words">{t("assetRatePerUnit", { unit: account.symbol === "XAU" ? "g" : account.symbol, amount: rateText })}</p>
              <p>{t("assetQuoteAt", { date: quoteDate })}</p></div>}
            <div className="mt-4 flex flex-wrap items-center gap-1 border-t pt-3"><ValuedAccountForm account={account} /><BalanceHistory account={account} />
              <RecordDeleteButton url={"/api/valued-accounts/" + account.id} detail={account.name} description="deleteValuedAccountHint" success="valuedAccountDeleted" /></div>
          </CardContent></Card>
        })}</div>}
    </>}
    <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">{t("assetReferenceHint")}</p>
    <AssetRateAttribution />
  </section>
}

function ValuedAccountForm({ account }: { account?: ValuedAccount }) {
  const { t, locale, formatCurrency } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [symbol, setSymbol] = useState<AssetSymbol>("XAU")
  const [quantity, setQuantity] = useState("")
  const [date, setDate] = useState(getToday())
  const [description, setDescription] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const parsed = parseAssetQuantity(quantity, symbol)
  const places = quantityPlaces(symbol)
  const valid = name.trim() && parsed !== null && isDate(date) && date >= "1900-01-01" && date <= getToday()
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !valid) return
    setBusy(true); setError("")
    try {
      await requestJson("/api/valued-accounts" + (account ? "/" + account.id : ""), jsonBody(account ? "PATCH" : "POST", { name, symbol, quantity, date, description }))
      setOpen(false); notify("valuedAccountSaved"); window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={(value) => { if (busy) return; setOpen(value); if (value) {
    setName(account?.name ?? ""); setSymbol(account?.symbol ?? "XAU"); setQuantity(account ? String(account.quantity) : ""); setDate(getToday()); setDescription(account?.description ?? ""); setError("")
  } }}><DialogTrigger asChild><Button variant={account ? "ghost" : "default"} size={account ? "sm" : "default"} aria-label={account ? t("editAssetBalance") + " " + account.name : undefined}>
    {account ? <Pencil aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}{t(account ? "editAssetBalance" : "addValuedAccount")}</Button></DialogTrigger>
    <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>{t(account ? "editAssetBalance" : "addValuedAccount")}</DialogTitle><DialogDescription>{t("assetSnapshotHint")}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
        <Field id={id + "-name"} label={t("name")} required><Input id={id + "-name"} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field id={id + "-symbol"} label={t("assetUnit")} required><Select value={symbol} disabled={Boolean(account)} onValueChange={(value) => { setSymbol(value as AssetSymbol); setQuantity("") }}>
          <SelectTrigger id={id + "-symbol"}><SelectValue /></SelectTrigger><SelectContent>{assetSymbols.map((value) => <SelectItem key={value} value={value}>{symbolLabel(value, locale, t("goldBalance"))}</SelectItem>)}</SelectContent></Select></Field>
        <Field id={id + "-quantity"} label={symbol === "XAU" ? t("goldGrams") : t("assetNativeBalance", { currency: symbol })}
          hint={t(places ? "assetQuantityHint" : "assetWholeQuantityHint", { places, max: symbol === "XAU" ? 10000 : 1000000 })} required>
          <Input id={id + "-quantity"} type="text" inputMode={places ? "decimal" : "numeric"} pattern={places ? "[0-9]+([.,][0-9]{1," + places + "})?" : "[0-9]+"}
            aria-describedby={id + "-quantity-hint"} value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          {parsed !== null && <p className="break-words text-sm font-medium tabular-nums text-brand-active">{formatAssetQuantity(parsed, symbol, locale)}</p>}
          {parsed !== null && account?.rate && <p className="break-words text-sm tabular-nums">{t("assetEstimatedValue")}: {formatCurrency(assetMarketValue(parsed, account.rate.idrRate))}</p>}
        </Field>
        <Field id={id + "-date"} label={t("date")} required><Input id={id + "-date"} type="date" min="1900-01-01" max={getToday()} value={date} onChange={(event) => setDate(event.target.value)} required /></Field>
        <Field id={id + "-note"} label={t("note")}><Input id={id + "-note"} value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></Field>
      </fieldset><ErrorNotice message={error} /><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("cancel")}</Button><SubmitButton busy={busy} disabled={!valid}>{t("saveChanges")}</SubmitButton></DialogFooter></form>
    </DialogContent></Dialog>
}

function BalanceHistory({ account }: { account: ValuedAccount }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button variant="ghost" size="sm" aria-label={t("assetBalanceHistory") + " " + account.name}><History aria-hidden="true" className="size-4" />{t("assetBalanceHistory")}</Button></DialogTrigger>
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto"><DialogHeader><DialogTitle>{account.name}</DialogTitle><DialogDescription>{t("assetBalanceHistoryHint")}</DialogDescription></DialogHeader>
      {open && <HistoryRows account={account} />}</DialogContent></Dialog>
}

function HistoryRows({ account }: { account: ValuedAccount }) {
  const { t, locale, formatDate } = useLanguage()
  const history = useRemoteData<Array<{ id: number; quantity: number; date: string }>>("/api/valued-accounts/" + account.id)
  if (history.loading) return <LoadingState />
  if (history.error) return <ErrorNotice message={history.error} onRetry={history.reload} />
  return <ol className="divide-y">{history.data?.map((row) => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{formatDate(row.date)}</span><span className="font-medium tabular-nums">{formatAssetQuantity(row.quantity, account.symbol, locale)}</span></li>)}
    {!history.data?.length && <li className="py-3 text-sm text-muted-foreground">{t("noTransactions")}</li>}</ol>
}
