"use client"

import { PageInsights } from "./page-insights"
import { useEffect, useMemo, useState } from "react"
import { Search, SlidersHorizontal, Trash2 } from "lucide-react"
import { TransactionForm } from "./transaction-form"
import { TransactionGroups } from "./transaction-groups"
import { CategoryFields } from "./category-fields"
import { AiTransactionDrafts, ReceiptReader } from "./ai-transaction-drafts"
import { useLanguage } from "./language-provider"
import {
  ConfirmDelete,
  EmptyState,
  ErrorNotice,
  Field,
  LoadingState,
  PageHeading,
  useFeedback,
} from "./feedback"
import { AddAccountForm } from "./accounts-form"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Input } from "./ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import {
  getCurrentMonth,
  getNextMonthStart,
  type TransactionType,
} from "@/lib/finance"
import { useRemoteData } from "@/lib/use-remote-data"
import { requestJson } from "@/lib/client-api"
import type { Account, Transaction, TransactionGroupSummary } from "@/lib/types"

type TransactionPage = {
  items: Transaction[]
  total: number
  page: number
  totalPages: number
  summary: { income: number; expense: number }
  groups: TransactionGroupSummary[]
}
const colors = {
  income: "text-positive bg-positive-soft",
  expense: "text-negative bg-negative-soft",
  transfer: "text-brand-active bg-brand-soft",
}
const noAccounts: Account[] = []

export function TransactionList() {
  const { t, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [type, setType] = useState<"all" | TransactionType>("all")
  const [category, setCategory] = useState("")
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [account, setAccount] = useState("all")
  const [group, setGroup] = useState("all")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const invalidRange = Boolean(from && to && from > to)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const params = new URLSearchParams({
    page: String(page),
    limit: "25",
    search: debouncedSearch,
    type,
    category,
    subcategory: subcategory ?? "",
    account,
    group: group.startsWith("group:") ? group.slice(6) : "",
    ungrouped: String(group === "ungrouped"),
    from,
    to: invalidRange ? "" : to,
  })
  const records = useRemoteData<TransactionPage>("/api/transactions?" + params)
  const accountData = useRemoteData<Account[]>("/api/accounts")
  const groupData = useRemoteData<string[]>("/api/transactions/groups")
  const accounts = accountData.data ?? noAccounts
  const groupNames = [
    ...new Set([
      ...(groupData.data ?? []),
      ...(group.startsWith("group:") ? [group.slice(6)] : []),
    ]),
  ]
  const selectedGroupName = group.startsWith("group:") ? group.slice(6) : undefined
  const accountsById = useMemo(
    () => new Map(accounts.map((item) => [item.id, item.name])),
    [accounts],
  )
  const hasFilters = Boolean(
    search || type !== "all" || category || subcategory || account !== "all" || group !== "all" || from || to,
  )
  function resetFilters() {
    setSearch("")
    setDebouncedSearch("")
    setType("all")
    setCategory("")
    setSubcategory(null)
    setAccount("all")
    setGroup("all")
    setFrom("")
    setTo("")
    setPage(1)
  }
  function selectThisMonth() {
    const month = getCurrentMonth()
    const lastDay = new Date(getNextMonthStart(month) + "T00:00:00Z")
    lastDay.setUTCDate(lastDay.getUTCDate() - 1)
    setFrom(month + "-01")
    setTo(lastDay.toISOString().slice(0, 10))
    setPage(1)
  }
  async function deleteTransaction() {
    if (!deleting || busy) return
    setBusy(true)
    setDeleteError("")
    try {
      await requestJson("/api/transactions/" + deleting.id, {
        method: "DELETE",
      })
      setDeleting(null)
      notify("transactionDeleted")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setDeleteError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const error = accountData.error || records.error
  const loading =
    accountData.loading || records.loading || search !== debouncedSearch
  const data = records.data

  return (
    <div className="space-y-6">
      <PageHeading
        title={t("transactionTitle")}
        description={t("transactionDescription")}
      >
        <ReceiptReader accounts={accounts} />
        {accounts.length ? (
          <TransactionForm
            accounts={accounts}
            defaultGroupName={selectedGroupName}
            onSaved={() => {}}
          />
        ) : !accountData.loading && !accountData.error ? (
          <AddAccountForm />
        ) : null}
      </PageHeading>
      <PageInsights context={{ page: "transactions", filters: new URLSearchParams([...params].filter(([key]) => key !== "page" && key !== "limit")).toString() }} ready={Boolean(data) && !loading && !records.refreshing && !error && !invalidRange} />
      {!accountData.loading && !accountData.error && <AiTransactionDrafts accounts={accounts} />}
      <Card className="shadow-none">
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal className="h-4 w-4" />
              {t("filters")}
            </h2>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={selectThisMonth}>
                {t("thisMonth")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                disabled={!hasFilters}
              >
                {t("resetFilters")}
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Field id="search-transactions" label={t("search")}>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
                />
                <Input
                  id="search-transactions"
                  className="pl-9"
                  placeholder={t("searchTransactions")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </Field>
            <Field id="filter-type" label={t("type")}>
              <Select
                value={type}
                onValueChange={(value) => {
                  setType(value as "all" | TransactionType)
                  setCategory("")
                  setSubcategory(null)
                  setPage(1)
                }}
              >
                <SelectTrigger id="filter-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["all", "income", "expense", "transfer"].map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(value === "all" ? "allTypes" : value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <CategoryFields id="filter" type={type} category={category} subcategory={subcategory} filter
              onChange={(category, subcategory) => { setCategory(category); setSubcategory(subcategory); setPage(1) }} />
            <Field id="filter-account" label={t("account")}>
              <Select
                value={account}
                onValueChange={(value) => {
                  setAccount(value)
                  setPage(1)
                }}
              >
                <SelectTrigger id="filter-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allAccounts")}</SelectItem>
                  {accounts.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="filter-group" label={t("transactionGroup")}>
              <Select
                value={group}
                onValueChange={(value) => {
                  setGroup(value)
                  setPage(1)
                }}
              >
                <SelectTrigger id="filter-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allGroups")}</SelectItem>
                  <SelectItem value="ungrouped">{t("ungroupedTransactions")}</SelectItem>
                  {groupNames.map((name) => (
                    <SelectItem key={name} value={"group:" + name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="filter-from" label={t("fromDate")}>
              <Input
                id="filter-from"
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value)
                  setPage(1)
                }}
              />
            </Field>
            <Field id="filter-to" label={t("toDate")}>
              <Input
                id="filter-to"
                type="date"
                min={from || undefined}
                aria-invalid={invalidRange}
                aria-describedby={
                  invalidRange ? "filter-date-error" : undefined
                }
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setPage(1)
                }}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">{t("filtersHint")}</p>
          <ErrorNotice message={groupData.error} onRetry={groupData.reload} />
          {invalidRange && (
            <p
              id="filter-date-error"
              role="alert"
              className="text-sm text-negative"
            >
              {t("filterDateError")}
            </p>
          )}
        </CardContent>
      </Card>
      {error ? (
        <ErrorNotice
          message={error}
          onRetry={() => {
            records.reload()
            accountData.reload()
          }}
        />
      ) : loading ? (
        <LoadingState />
      ) : invalidRange ? null : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["matchingIncome", data.summary.income, "text-positive"],
                ["matchingExpense", data.summary.expense, "text-negative"],
                [
                  "matchingNet",
                  data.summary.income - data.summary.expense,
                  "text-foreground",
                ],
              ].map(([label, amount, tone]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border bg-card p-4"
                >
                  <p className="text-xs text-muted-foreground">
                    {t(String(label))}
                  </p>
                  <p
                    className={
                      "mt-2 text-xl font-semibold tabular-nums " + tone
                    }
                  >
                    {formatCurrency(Number(amount))}
                  </p>
                </div>
              ))}
            </div>
            <TransactionGroups
              groups={data.groups}
              selectedGroup={group}
              onSelect={(value) => {
                setGroup(value)
                setPage(1)
              }}
            />
            {accounts.length === 0 ? (
              <EmptyState
                title={t("noAccounts")}
                description={t("accountHelp")}
              >
                <AddAccountForm />
              </EmptyState>
            ) : data.items.length === 0 ? (
              <EmptyState
                title={t(
                  hasFilters ? "noMatchingTransactions" : "noTransactions",
                )}
                description={t(
                  hasFilters ? "noMatchesHint" : "noTransactionsHint",
                )}
              >
                {hasFilters ? (
                  <Button variant="outline" onClick={resetFilters}>
                    {t("resetFilters")}
                  </Button>
                ) : (
                  <TransactionForm
                    accounts={accounts}
                    defaultGroupName={selectedGroupName}
                    onSaved={() => {}}
                  />
                )}
              </EmptyState>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
                  <h2 className="font-semibold">{t("transactionHistory")}</h2>
                  <span className="text-xs text-muted-foreground">
                    {t("results", { count: data.total })}
                  </span>
                </div>
                <p className="px-4 pb-3 text-xs text-muted-foreground lg:hidden">
                  {t("transactionTableHint")}
                </p>
                <div
                  role="region"
                  aria-label={t("transactionHistory")}
                  tabIndex={0}
                  className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <table className="w-full min-w-[700px] text-sm">
                    <caption className="sr-only">
                      {t("transactionHistory")}
                    </caption>
                    <thead className="bg-muted/50">
                      <tr>
                        {[
                          "date",
                          "type",
                          "category",
                          "account",
                          "amount",
                          "actions",
                        ].map((key) => (
                          <th
                            scope="col"
                            key={key}
                            className={
                              "p-4 font-medium text-muted-foreground " +
                              (key === "amount" || key === "actions"
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
                      {data.items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-t hover:bg-muted/30"
                        >
                          <td className="whitespace-nowrap p-4">
                            {formatDate(item.date)}
                          </td>
                          <td className="p-4">
                            <span
                              className={
                                "rounded-md px-2 py-1 text-xs font-medium " +
                                colors[item.type]
                              }
                            >
                              {t(item.type)}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-medium">
                              {t(item.category)}
                            </span>
                            {item.subcategory && <p className="mt-1 max-w-[220px] break-words text-xs text-muted-foreground">{t(item.subcategory)}</p>}
                            {item.groupName && (
                              <p className="mt-1 max-w-[220px] break-words text-xs font-medium text-brand-active">
                                {item.groupName}
                              </p>
                            )}
                            {item.description && (
                              <p className="mt-1 max-w-[220px] break-words text-xs text-muted-foreground">
                                {item.description}
                              </p>
                            )}
                          </td>
                          <td className="p-4 text-muted-foreground">
                            {accountsById.get(item.accountId) ?? t("account")}
                            {item.type === "transfer" &&
                              " → " +
                                (accountsById.get(
                                  item.destinationAccountId ?? 0,
                                ) ?? t("account"))}
                          </td>
                          <td
                            className={
                              "whitespace-nowrap p-4 text-right font-semibold tabular-nums " +
                              (item.type === "expense"
                                ? "text-negative"
                                : item.type === "income"
                                  ? "text-positive"
                                  : "")
                            }
                          >
                            {item.type === "income"
                              ? "+"
                              : item.type === "expense"
                                ? "−"
                                : ""}
                            {formatCurrency(item.amount)}
                          </td>
                          <td className="p-4">
                            <div className="flex justify-end gap-2">
                              <TransactionForm
                                accounts={accounts}
                                transaction={item}
                                onSaved={() => {}}
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={
                                  t("delete") +
                                  " " +
                                  t(item.category) +
                                  " " +
                                  formatCurrency(item.amount)
                                }
                                onClick={() => {
                                  setDeleting(item)
                                  setDeleteError("")
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
                  <span className="text-muted-foreground">
                    {t("page", { current: data.page, total: data.totalPages })}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.page <= 1}
                      onClick={() => setPage(data.page - 1)}
                    >
                      {t("previous")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.page >= data.totalPages}
                      onClick={() => setPage(data.page + 1)}
                    >
                      {t("next")}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        )
      )}
      <ConfirmDelete
        open={Boolean(deleting)}
        onOpenChange={(value) => {
          if (!value) setDeleting(null)
        }}
        detail={
          deleting
            ? t(deleting.category) +
              " · " +
              formatCurrency(deleting.amount) +
              " · " +
              formatDate(deleting.date)
            : ""
        }
        description={t("transactionDeleteHint")}
        busy={busy}
        error={deleteError}
        onConfirm={() => void deleteTransaction()}
      />
    </div>
  )
}
