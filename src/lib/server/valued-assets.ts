import { and, asc, desc, eq, getTableColumns, lte } from "drizzle-orm"
import { assetRates, valuedAccountBalances, valuedAccounts } from "@/db/schema"
import { assetMarketValue, valuedAssetTotals, type AssetSymbol, type ValuedAccountsData } from "@/lib/valued-assets"
import { getToday } from "@/lib/finance"
import type { ReadConnection } from "./ledger"

export async function readValuedAssets(connection: ReadConnection, asOf = getToday()): Promise<ValuedAccountsData> {
  const balance = connection.select().from(valuedAccountBalances)
    .where(and(eq(valuedAccountBalances.accountId, valuedAccounts.id), lte(valuedAccountBalances.date, asOf)))
    .orderBy(desc(valuedAccountBalances.date), desc(valuedAccountBalances.id)).limit(1).as("latest_balance")
  const rate = connection.select().from(assetRates)
    .where(and(eq(assetRates.symbol, valuedAccounts.symbol), lte(assetRates.date, asOf)))
    .orderBy(desc(assetRates.date)).limit(1).as("latest_rate")
  const rows = await connection.select({ account: getTableColumns(valuedAccounts),
    balance: { quantity: balance.quantity, date: balance.date },
    rate: { symbol: rate.symbol, idrRate: rate.idrRate, date: rate.date, observedAt: rate.observedAt,
      oldestInputAt: rate.oldestInputAt, expiresAt: rate.expiresAt, source: rate.source },
  }).from(valuedAccounts)
    .innerJoinLateral(balance, eq(balance.accountId, valuedAccounts.id))
    .leftJoinLateral(rate, eq(rate.symbol, valuedAccounts.symbol)).orderBy(asc(valuedAccounts.id))
  const valued = rows.map(({ account, balance, rate }) => {
    return { id: account.id, name: account.name, symbol: account.symbol as AssetSymbol, description: account.description,
      quantity: balance.quantity, balanceDate: balance.date, rate,
      marketValue: balance.quantity === 0 ? 0 : rate ? assetMarketValue(balance.quantity, rate.idrRate) : null,
      stale: Boolean(rate && Date.parse(asOf + "T23:59:59+07:00") - rate.oldestInputAt.getTime() > 3 * 86400000) }
  })
  return { accounts: valued, totals: valuedAssetTotals(valued) }
}

export async function readValuedAccountHistory(connection: ReadConnection, accountId: number) {
  return connection.select().from(valuedAccountBalances)
    .where(and(eq(valuedAccountBalances.accountId, accountId), lte(valuedAccountBalances.date, getToday())))
    .orderBy(desc(valuedAccountBalances.date), desc(valuedAccountBalances.id)).limit(50)
}
