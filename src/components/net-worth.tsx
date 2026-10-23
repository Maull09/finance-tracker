"use client"

import { PageInsights } from "./page-insights"
import { useLanguage } from "./language-provider"
import { AddAccountForm } from "./accounts-form"
import { EmptyState, ErrorNotice, LoadingState, PageHeading } from "./feedback"
import { Button } from "./ui/button"
import { useRemoteData } from "@/lib/use-remote-data"
import type { NetWorthData } from "@/lib/planning-types"

export function NetWorth() {
  const { t, formatCurrency } = useLanguage()
  const records = useRemoteData<NetWorthData>("/api/net-worth")
  const data = records.data
  return (
    <div className="space-y-6">
      <PageHeading title={t("netWorth")} description={t("netWorthDescription")}>
        <Button
          variant="outline"
          onClick={records.reload}
          disabled={records.loading || records.refreshing}
        >
          {t("refresh")}
        </Button>
      </PageHeading>
      <PageInsights context={{ page: "netWorth" }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      {records.refreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {records.error ? (
        <ErrorNotice message={records.error} onRetry={records.reload} />
      ) : records.loading ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <section
              className="rounded-xl border bg-card p-5 sm:p-7"
              aria-label={t("netWorth")}
            >
              <p className="text-sm text-muted-foreground">
                {t(data.netWorth === null ? "knownNetWorth" : "netWorth")}
              </p>
              <p
                className={
                  "mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl " +
                  (data.knownNetWorth < 0 ? "text-negative" : "text-foreground")
                }
              >
                {formatCurrency(data.knownNetWorth)}
              </p>
              {data.netWorth === null && (
                <p role="status" className="mt-3 text-sm text-warning">
                  {t("incompleteNetWorth")}
                </p>
              )}
              <p className="mt-4 max-w-2xl text-sm text-muted-foreground">
                {t("netWorthRule")}
              </p>
            </section>
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-xl border bg-card p-5">
                <h2 className="font-semibold">{t("assetsAndLiabilities")}</h2>
                <dl className="mt-4 divide-y">
                  {[
                    ["cashAssets", data.cash],
                    ["stockAssets", data.investments.knownMarketValue],
                    ["receivableAssets", data.receivables],
                    ["debtLiabilities", -data.liabilities],
                  ].map(([key, value]) => (
                    <div
                      key={String(key)}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                    >
                      <dt>{t(String(key))}</dt>
                      <dd
                        className={
                          "font-semibold tabular-nums " +
                          (Number(value) < 0 ? "text-negative" : "")
                        }
                      >
                        {formatCurrency(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 border-t pt-4 text-sm">
                  <p className="flex flex-wrap justify-between gap-2">
                    <span>{t("reservedCash")}</span>
                    <span className="tabular-nums">
                      {formatCurrency(data.reservedCash)}
                    </span>
                  </p>
                  <p className="mt-2 flex flex-wrap justify-between gap-2">
                    <span>{t("availableCash")}</span>
                    <span
                      className={
                        "font-semibold tabular-nums " +
                        (data.availableCash < 0 ? "text-negative" : "")
                      }
                    >
                      {formatCurrency(data.availableCash)}
                    </span>
                  </p>
                </div>
                <Button asChild variant="link" className="mt-3 px-0">
                  <a href="#investments">{t("portfolio")}</a>
                </Button>
              </section>
              <section className="rounded-xl border bg-card p-5">
                <h2 className="font-semibold">{t("accountBreakdown")}</h2>
                <ul className="mt-4 divide-y">
                  {data.accounts.map((account) => (
                    <li
                      key={account.id}
                      className="flex flex-wrap justify-between gap-2 py-3 text-sm"
                    >
                      <span>{account.name}</span>
                      <span className="font-semibold tabular-nums">
                        {formatCurrency(account.balance)}
                      </span>
                    </li>
                  ))}
                </ul>
                {data.accounts.length === 0 && (
                  <EmptyState
                    title={t("noAccounts")}
                    description={t("accountHelp")}
                  >
                    <AddAccountForm />
                  </EmptyState>
                )}
              </section>
            </div>
            <section className="space-y-3">
              <h2 className="font-semibold">{t("outstandingObligations")}</h2>
              {data.debts.filter((debt) => debt.remaining > 0).length === 0 ? (
                <EmptyState
                  title={t("noObligations")}
                  description={t("netWorthDescription")}
                />
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {data.debts
                    .filter((debt) => debt.remaining > 0)
                    .map((debt) => (
                      <li
                        key={debt.id}
                        className="flex flex-wrap justify-between gap-2 p-4 text-sm"
                      >
                        <span>
                          {t(
                            debt.type === "utang" ? "debtTo" : "receivableFrom",
                          )}{" "}
                          {debt.name}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatCurrency(debt.remaining)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          </>
        )
      )}
    </div>
  )
}
