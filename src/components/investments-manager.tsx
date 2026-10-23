"use client"

import { PageInsights } from "./page-insights"
import { useCallback, useEffect, useRef, useState, useId } from "react"
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useLanguage } from "./language-provider"
import { AddAccountForm } from "./accounts-form"
import { RecordDeleteButton } from "./record-delete-button"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { useRemoteData } from "@/lib/use-remote-data"
import { requestJson, jsonBody } from "@/lib/client-api"
import { formatStockPrice, formatStockQuantity, getToday } from "@/lib/finance"
import { tradeCashChange } from "@/lib/investments"
import { parseStockTrade } from "@/lib/planning-validation"
import type { PortfolioData, CashAccount } from "@/lib/planning-types"

type PriceResult = {
  updated: number
  cached: number
  failures: Array<{ symbol: string; code: string }>
  pending: number
}

export function InvestmentsManager() {
  const { t, locale, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const records = useRemoteData<PortfolioData>("/api/investments")
  const data = records.data
  const [activeTab, setActiveTab] = useState("portfolio")
  const priceAttempted = useRef(false)
  const [priceBusy, setPriceBusy] = useState(false)
  const [priceError, setPriceError] = useState("")
  const [priceResult, setPriceResult] = useState<PriceResult | null>(null)
  const [deleting, setDeleting] = useState<{
    url: string
    detail: string
    kind: "trade" | "watch"
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  const updatePrices = useCallback(async () => {
    if (priceBusy) return
    setPriceBusy(true)
    setPriceError("")
    setPriceResult(null)
    try {
      const result = await requestJson<PriceResult>(
        "/api/investments/prices/refresh",
        { method: "POST" },
      )
      setPriceResult(result)
      if (result.failures.length) setPriceError(result.failures[0].code)
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (error) {
      setPriceError((error as Error).message)
    } finally {
      setPriceBusy(false)
    }
  }, [priceBusy])

  useEffect(() => {
    if (data && !priceAttempted.current) {
      priceAttempted.current = true
      void updatePrices()
    }
  }, [data, updatePrices])

  async function remove() {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true)
    setDeleteError("")
    try {
      await requestJson(deleting.url, { method: "DELETE" })
      notify(deleting.kind === "trade" ? "tradeDeleted" : "watchRemoved")
      setDeleting(null)
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (error) {
      setDeleteError((error as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }

  function askDelete(url: string, detail: string, kind: "trade" | "watch") {
    setDeleting({ url, detail, kind })
    setDeleteError("")
  }
  const showMoney = (amount: number | null) =>
    amount === null ? t("unpriced") : formatCurrency(amount)

  return (
    <div className="space-y-6">
      <PageHeading
        title={t("investments")}
        description={t("investmentsDescription")}
      >
        <Button
          variant="outline"
          disabled={priceBusy || records.loading || !data}
          onClick={() => void updatePrices()}
        >
          <RefreshCw
            className={"h-4 w-4 " + (priceBusy ? "animate-spin" : "")}
          />
          {t(priceBusy ? "refreshing" : "refreshPrices")}
        </Button>
        <StockTradeForm accounts={data?.accounts ?? []} />
      </PageHeading>
      <PageInsights context={{ page: "investments" }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
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
            <ErrorNotice message={priceError} />
            {priceResult && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("priceUpdateResult", {
                  updated: priceResult.updated,
                  cached: priceResult.cached,
                  failed: priceResult.failures.length,
                  pending: priceResult.pending,
                })}
                {priceResult.failures.length > 0 &&
                  " " +
                    priceResult.failures.map((item) => item.symbol).join(", ")}
              </p>
            )}
            <dl className="grid gap-5 rounded-xl border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["costBasis", data.totals.costBasis],
                ["marketValue", data.totals.marketValue],
                ["unrealizedGain", data.totals.unrealizedGain],
                ["realizedGain", data.totals.realizedGain],
              ].map(([key, amount]) => (
                <div key={String(key)}>
                  <dt className="text-sm text-muted-foreground">
                    {t(String(key))}
                  </dt>
                  <dd
                    className={
                      "mt-2 text-xl font-semibold tabular-nums " +
                      (Number(amount) < 0 ? "text-negative" : "")
                    }
                  >
                    {showMoney(amount as number | null)}
                  </dd>
                </div>
              ))}
            </dl>
            {data.totals.unpricedCount > 0 && (
              <p className="text-sm text-warning">
                {t("unpricedHint", { count: data.totals.unpricedCount })}
              </p>
            )}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="max-w-full">
                <TabsTrigger value="portfolio">{t("portfolio")}</TabsTrigger>
                <TabsTrigger value="watchlist">{t("watchlist")}</TabsTrigger>
                <TabsTrigger value="history">{t("tradeHistory")}</TabsTrigger>
              </TabsList>
              <TabsContent value="portfolio" className="space-y-5 pt-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    {t("manageTradesHint")}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => setActiveTab("history")}
                  >
                    {t("manageTrades")}
                  </Button>
                </div>
                {data.accounts.length === 0 ? (
                  <EmptyState
                    title={t("noHoldings")}
                    description={t("noHoldingsHint")}
                  >
                    <AddAccountForm defaultType="investment" />
                  </EmptyState>
                ) : (
                  <>
                    <section
                      aria-label={t("investmentCash")}
                      className="flex flex-wrap gap-4 rounded-lg border bg-card p-4"
                    >
                      {data.accounts.map((account) => (
                        <div key={account.id} className="min-w-40">
                          <p className="text-sm font-medium">{account.name}</p>
                          <p className="mt-1 text-sm tabular-nums">
                            {t("investmentCash")}:{" "}
                            {formatCurrency(account.balance)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("availableCash")}:{" "}
                            {formatCurrency(account.availableCash)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <AddAccountForm account={account} />
                            <RecordDeleteButton
                              url={"/api/accounts/" + account.id}
                              detail={account.name}
                              description="deleteAccountHint"
                              success="accountDeleted"
                            />
                          </div>
                        </div>
                      ))}
                      <div className="flex items-center">
                        <AddAccountForm defaultType="investment" />
                      </div>
                    </section>
                    {data.holdings.filter((holding) => holding.shares > 0)
                      .length === 0 ? (
                      <EmptyState
                        title={t("noHoldings")}
                        description={t("noHoldingsHint")}
                      >
                        <StockTradeForm accounts={data.accounts} />
                      </EmptyState>
                    ) : (
                      <div
                        role="region"
                        aria-label={t("portfolio")}
                        tabIndex={0}
                        className="overflow-x-auto rounded-xl border bg-card"
                      >
                        <table className="w-full min-w-[850px] text-sm">
                          <caption className="sr-only">
                            {t("portfolio")}
                          </caption>
                          <thead className="bg-muted/50">
                            <tr>
                              {[
                                "stockSymbol",
                                "shares",
                                "averageCost",
                                "marketPrice",
                                "marketValue",
                                "unrealizedGain",
                              ].map((key, index) => (
                                <th
                                  key={key}
                                  scope="col"
                                  className={
                                    "p-4 font-medium text-muted-foreground " +
                                    (index === 0 ? "text-left" : "text-right")
                                  }
                                >
                                  {t(key)}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {data.holdings
                              .filter((holding) => holding.shares > 0)
                              .map((holding) => (
                                <tr
                                  key={holding.accountId + ":" + holding.symbol}
                                  className="border-t"
                                >
                                  <td className="p-4">
                                    <p className="font-semibold">
                                      {holding.symbol}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {holding.name} / {holding.accountName}
                                    </p>
                                  </td>
                                  <td className="p-4 text-right tabular-nums">
                                    {formatStockQuantity(
                                      holding.shares,
                                      locale,
                                    )}
                                  </td>
                                  <td className="p-4 text-right tabular-nums">
                                    {formatStockPrice(
                                      holding.averageCost,
                                      locale,
                                    )}
                                  </td>
                                  <td className="p-4 text-right tabular-nums">
                                    {holding.marketPrice === null
                                      ? t("unpriced")
                                      : formatStockPrice(
                                          holding.marketPrice,
                                          locale,
                                        )}
                                    {holding.priceDate && (
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {formatDate(holding.priceDate)}
                                        <br />
                                        {holding.source}
                                      </p>
                                    )}
                                  </td>
                                  <td className="p-4 text-right font-semibold tabular-nums">
                                    {showMoney(holding.marketValue)}
                                  </td>
                                  <td
                                    className={
                                      "p-4 text-right tabular-nums " +
                                      ((holding.unrealizedGain ?? 0) < 0
                                        ? "text-negative"
                                        : "text-brand-active")
                                    }
                                  >
                                    {showMoney(holding.unrealizedGain)}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("corporateActionsHint")}
                </p>
              </TabsContent>
              <TabsContent value="watchlist" className="space-y-4 pt-3">
                <div className="flex justify-end">
                  <WatchlistForm />
                </div>
                {data.watchlist.length === 0 ? (
                  <EmptyState
                    title={t("noWatchlist")}
                    description={t("noWatchlistHint")}
                  >
                    <WatchlistForm />
                  </EmptyState>
                ) : (
                  <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                    {data.watchlist.map((item) => (
                      <li
                        key={item.symbol}
                        className="flex flex-wrap items-center justify-between gap-3 p-4"
                      >
                        <div>
                          <p className="font-semibold">
                            {item.symbol}{" "}
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {item.name}
                            </span>
                          </p>
                          {item.note && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.note}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-right">
                            <p className="font-semibold tabular-nums">
                              {item.quote
                                ? formatStockPrice(item.quote.price, locale)
                                : t("unpriced")}
                            </p>
                            {item.quote && (
                              <p className="text-xs text-muted-foreground">
                                {formatDate(item.quote.date)} /{" "}
                                {item.quote.source}
                              </p>
                            )}
                          </div>
                          <WatchlistForm item={item} />
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t("removeWatch") + " " + item.symbol}
                            onClick={() =>
                              askDelete(
                                "/api/investments/watchlist/" + item.symbol,
                                item.symbol,
                                "watch",
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                            {t("delete")}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
              <TabsContent value="history" className="space-y-4 pt-3">
                {!data.trades.length ? (
                  <EmptyState
                    title={t("noTrades")}
                    description={t("stockSymbolHint")}
                  >
                    {data.accounts.length > 0 && (
                      <StockTradeForm accounts={data.accounts} />
                    )}
                  </EmptyState>
                ) : (
                  <div
                    role="region"
                    aria-label={t("tradeHistory")}
                    tabIndex={0}
                    className="overflow-x-auto rounded-xl border bg-card"
                  >
                    <table className="w-full min-w-[700px] text-sm">
                      <caption className="sr-only">{t("tradeHistory")}</caption>
                      <thead className="bg-muted/50">
                        <tr>
                          {[
                            "date",
                            "stockSymbol",
                            "type",
                            "lots",
                            "pricePerShare",
                            "tradingFees",
                            "tradeTotal",
                            "actions",
                          ].map((key) => (
                            <th
                              scope="col"
                              key={key}
                              className={
                                "p-3 font-medium text-muted-foreground " +
                                ([
                                  "lots",
                                  "pricePerShare",
                                  "tradingFees",
                                  "tradeTotal",
                                ].includes(key)
                                  ? "text-right"
                                  : "text-left")
                              }
                            >
                              {t(key)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.trades.map((trade) => (
                          <tr key={trade.id} className="border-t">
                            <td className="whitespace-nowrap p-3">
                              {formatDate(trade.date)}
                            </td>
                            <td className="p-3 font-medium">
                              {trade.symbol}
                              <p className="text-xs font-normal text-muted-foreground">
                                {
                                  data.accounts.find(
                                    (account) => account.id === trade.accountId,
                                  )?.name
                                }
                              </p>
                              {trade.note && (
                                <p className="max-w-48 break-words text-xs font-normal text-muted-foreground">
                                  {trade.note}
                                </p>
                              )}
                            </td>
                            <td className="p-3">{t(trade.side)}</td>
                            <td className="p-3 text-right tabular-nums">
                              {formatStockQuantity(
                                trade.shares / 100,
                                locale,
                                6,
                              )}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {formatStockPrice(trade.price, locale)}
                            </td>
                            <td className="p-3 text-right tabular-nums">
                              {formatCurrency(trade.fees)}
                            </td>
                            <td
                              className={
                                "p-3 text-right tabular-nums " +
                                (trade.side === "buy"
                                  ? "text-negative"
                                  : "text-brand-active")
                              }
                            >
                              {formatCurrency(tradeCashChange(trade))}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1">
                                <StockTradeForm
                                  accounts={data.accounts}
                                  trade={trade}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  aria-label={
                                    t("delete") +
                                    " " +
                                    trade.symbol +
                                    " " +
                                    formatDate(trade.date)
                                  }
                                  onClick={() =>
                                    askDelete(
                                      "/api/investments/trades/" + trade.id,
                                      `${trade.symbol} / ${t(trade.side)} / ${formatStockQuantity(trade.shares, locale)} ${t("shares")} / ${formatDate(trade.date)} / ${data.accounts.find((account) => account.id === trade.accountId)?.name ?? ""} / ${formatCurrency(tradeCashChange(trade))}`,
                                      "trade",
                                    )
                                  }
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                  {t("delete")}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )
      )}
      <ConfirmDelete
        open={Boolean(deleting)}
        onOpenChange={(value) => {
          if (!value) setDeleting(null)
        }}
        detail={deleting?.detail ?? ""}
        description={t(
          deleting?.kind === "watch" ? "removeWatchHint" : "tradeDeleteHint",
        )}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function StockTradeForm({
  accounts,
  trade,
}: {
  accounts: CashAccount[]
  trade?: PortfolioData["trades"][number]
}) {
  const { t, formatCurrency } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState("")
  const [side, setSide] = useState("buy")
  const [accountId, setAccountId] = useState("")
  const [lots, setLots] = useState("")
  const [price, setPrice] = useState("")
  const [fees, setFees] = useState("0")
  const [date, setDate] = useState(getToday())
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  let preview: ReturnType<typeof parseStockTrade> | null = null
  try {
    preview = parseStockTrade({
      symbol,
      side,
      accountId,
      lots,
      price,
      fees,
      date,
      note,
    })
  } catch {
    // Incomplete or invalid form values must not enter decimal arithmetic.
  }
  const valid = preview !== null
  const cashChange = preview ? tradeCashChange(preview) : 0
  const selectedAccount = accounts.find(
    (account) => String(account.id) === accountId,
  )
  const projectedAvailable = selectedAccount
    ? Math.round(
        (selectedAccount.availableCash +
          cashChange -
          (trade?.accountId === selectedAccount.id
            ? tradeCashChange(trade)
            : 0)) *
          100,
      ) / 100
    : null
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/investments/trades" + (trade ? "/" + trade.id : ""),
        jsonBody(trade ? "PATCH" : "POST", {
          symbol,
          side,
          accountId,
          lots,
          price,
          fees,
          date,
          note,
        }),
      )
      setOpen(false)
      setSymbol("")
      setLots("")
      setPrice("")
      setFees("0")
      setNote("")
      notify(trade ? "tradeUpdated" : "tradeSaved")
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
          if (value && trade) {
            setSymbol(trade.symbol)
            setSide(trade.side)
            setAccountId(String(trade.accountId))
            setLots((trade.shares / 100).toFixed(6).replace(/\.?0+$/, ""))
            setPrice(String(trade.price))
            setFees(String(trade.fees))
            setDate(trade.date)
            setNote(trade.note)
          } else if (value && accounts.length === 1 && !accountId)
            setAccountId(String(accounts[0].id))
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={!accounts.length}
          variant={trade ? "ghost" : "default"}
          size={trade ? "sm" : "default"}
          aria-label={trade ? t("edit") + " " + trade.symbol : undefined}
        >
          {trade ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t(trade ? "edit" : "recordTrade")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t(trade ? "editTrade" : "recordTrade")}</DialogTitle>
          <DialogDescription>
            {t(trade ? "tradeEditHint" : "stockSymbolHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <Field id={id + "-symbol"} label={t("stockSymbol")} required>
              <Input
                id={id + "-symbol"}
                value={symbol}
                onChange={(event) =>
                  setSymbol(event.target.value.toUpperCase())
                }
                maxLength={4}
                pattern="[A-Z]{4}"
                placeholder="BBCA"
                autoCapitalize="characters"
                required
              />
            </Field>
            <Field id={id + "-side"} label={t("tradeSide")} required>
              <Select value={side} onValueChange={setSide}>
                <SelectTrigger id={id + "-side"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">{t("buy")}</SelectItem>
                  <SelectItem value="sell">{t("sell")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field
                id={id + "-account"}
                label={t("brokerageAccount")}
                hint={
                  accountId
                    ? t("availableInAccount", {
                        amount: formatCurrency(
                          accounts.find(
                            (account) => String(account.id) === accountId,
                          )?.availableCash ?? 0,
                        ),
                      })
                    : undefined
                }
                required
              >
                <Select value={accountId} onValueChange={setAccountId} required>
                  <SelectTrigger id={id + "-account"}>
                    <SelectValue placeholder={t("chooseAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field
              id={id + "-lots"}
              label={t("lots")}
              hint={t("lotsHint")}
              required
            >
              <Input
                id={id + "-lots"}
                aria-describedby={id + "-lots-hint"}
                type="number"
                min="0.000001"
                max="100000"
                step="0.000001"
                inputMode="decimal"
                value={lots}
                onChange={(event) => setLots(event.target.value)}
                required
              />
            </Field>
            <Field
              id={id + "-price"}
              label={t("pricePerShare")}
              hint={t("stockPriceHint")}
              required
            >
              <Input
                id={id + "-price"}
                type="number"
                aria-describedby={id + "-price-hint"}
                min="0.0001"
                max="1000000000"
                step="0.0001"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
              />
            </Field>
            <Field id={id + "-fees"} label={t("tradingFees")}>
              <Input
                id={id + "-fees"}
                type="number"
                min="0"
                max="2147483647"
                step="1"
                value={fees}
                onChange={(event) => setFees(event.target.value)}
                required
              />
            </Field>
            <Field id={id + "-date"} label={t("date")} required>
              <Input
                id={id + "-date"}
                type="date"
                max={getToday()}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id={id + "-note"} label={t("note")}>
                <Input
                  id={id + "-note"}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </Field>
            </div>
          </fieldset>
          {valid && (
            <div
              className="rounded-lg bg-muted p-3 text-sm font-medium tabular-nums"
              role="status"
            >
              {trade && (
                <p>
                  {t("previousCashImpact")}:{" "}
                  {formatCurrency(tradeCashChange(trade))}
                </p>
              )}
              <p>
                {t("tradeTotal")}: {formatCurrency(cashChange)}
              </p>
              {trade && projectedAvailable !== null && (
                <p className={projectedAvailable < 0 ? "text-negative" : ""}>
                  {t("cashAfterEdit", { account: selectedAccount!.name })}:{" "}
                  {formatCurrency(projectedAvailable)}
                </p>
              )}
            </div>
          )}
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
            <SubmitButton busy={busy} disabled={!valid}>
              {t(trade ? "saveChanges" : "recordTrade")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function WatchlistForm({
  item,
}: { item?: PortfolioData["watchlist"][number] } = {}) {
  const { t } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [symbol, setSymbol] = useState("")
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/investments/watchlist" + (item ? "/" + item.symbol : ""),
        jsonBody(item ? "PATCH" : "POST", {
          symbol,
          name: name.trim() || symbol,
          note,
        }),
      )
      setOpen(false)
      setSymbol("")
      setName("")
      setNote("")
      notify(item ? "watchUpdated" : "watchAdded")
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
          if (value && item) {
            setSymbol(item.symbol)
            setName(item.name)
            setNote(item.note)
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={item ? "ghost" : "outline"}
          size={item ? "sm" : "default"}
          aria-label={item ? t("edit") + " " + item.symbol : undefined}
        >
          {item ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {t(item ? "edit" : "addWatch")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{t(item ? "editWatch" : "addWatch")}</DialogTitle>
          <DialogDescription>
            {t(item ? "watchEditHint" : "noWatchlistHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <Field id={id + "-symbol"} label={t("stockSymbol")} required>
              <Input
                id={id + "-symbol"}
                readOnly={Boolean(item)}
                value={symbol}
                onChange={(event) =>
                  setSymbol(event.target.value.toUpperCase())
                }
                maxLength={4}
                pattern="[A-Z]{4}"
                placeholder="BBCA"
                required
              />
            </Field>
            <Field
              id={id + "-name"}
              label={t("stockName") + " (" + t("optional") + ")"}
            >
              <Input
                id={id + "-name"}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
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
            <SubmitButton busy={busy} disabled={!/^[A-Z]{4}$/.test(symbol)}>
              {t(item ? "saveChanges" : "saveWatch")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
