"use client"

import type { TransactionGroupSummary } from "@/lib/types"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"

export function TransactionGroups({
  groups,
  selectedGroup,
  onSelect,
}: {
  groups: TransactionGroupSummary[]
  selectedGroup: string
  onSelect: (group: string) => void
}) {
  const { t, formatCurrency } = useLanguage()
  if (groups.length === 0) return null
  return (
    <section aria-labelledby="transaction-groups-heading" className="space-y-3">
      <div>
        <h2 id="transaction-groups-heading" className="text-xl font-semibold">
          {t("transactionsByGroup")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("groupsSummaryHint")}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const value =
            group.groupName === null ? "ungrouped" : "group:" + group.groupName
          const name = group.groupName ?? t("ungroupedTransactions")
          const selected = selectedGroup === value
          return (
            <div
              key={value}
              className={
                "@container flex min-w-0 flex-col rounded-xl border p-4 " +
                (selected ? "border-brand-border bg-brand-soft" : "bg-card")
              }
            >
              <h3 className="break-words font-semibold">{name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("groupTransactionCount", { count: group.count })}
              </p>
              <dl className="mt-4 grid gap-4 @sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{t("expenses")}</dt>
                  <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-destructive">
                    {formatCurrency(group.expense)}
                  </dd>
                </div>
                {group.income > 0 && (
                  <div className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{t("income")}</dt>
                    <dd className="mt-1 break-words text-xl font-semibold tabular-nums text-positive">
                      {formatCurrency(group.income)}
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-auto pt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  aria-pressed={selected}
                  onClick={() => onSelect(value)}
                >
                  {t("viewGroupTransactions")}
                  <span className="sr-only">{" " + name}</span>
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
