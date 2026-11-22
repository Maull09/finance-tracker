import { sumMoney } from "@/lib/money"
import type { UserDatabase } from "@/lib/server/authenticated-response"
import { eq, getTableColumns, inArray, or, sql } from "drizzle-orm"
import {
  accounts,
  transactions,
  stockTrades,
  sinkingFunds,
  sinkingFundEntries,
  goalContributions,
} from "@/db/schema"
import { calculateAccountBalance } from "../calculations"
import { totalTradeCashChange } from "../investments"
import { fundBalance } from "../planning"

export type ReadConnection = Pick<UserDatabase, "select">

export async function readLedger(
  connection: ReadConnection,
  accountIds?: number[],
) {
  const [allAccounts, allTransactions, trades] = await Promise.all([
    connection.select().from(accounts)
      .where(accountIds ? inArray(accounts.id, accountIds) : undefined),
    connection.select().from(transactions)
      .where(accountIds ? or(
        inArray(transactions.accountId, accountIds),
        inArray(transactions.destinationAccountId, accountIds),
      ) : undefined),
    connection.select().from(stockTrades)
      .where(accountIds ? inArray(stockTrades.accountId, accountIds) : undefined),
  ])
  const summaries = allAccounts.map((account) => ({
    ...account,
    balance:
      Math.round(
        (calculateAccountBalance(
          account.initialBalance,
          account.id,
          allTransactions,
        ) +
          totalTradeCashChange(
            trades.filter((trade) => trade.accountId === account.id),
          )) *
          100,
      ) / 100,
  }))
  return {
    accounts: allAccounts,
    transactions: allTransactions,
    trades,
    summaries,
    cashBalance:
      summaries.reduce(
        (total, account) => total + Math.round(account.balance * 100),
        0,
      ) / 100,
  }
}

export async function readReservations(
  connection: ReadConnection,
  accountIds?: number[],
) {
  const [funds, entries, contributions] = await Promise.all([
    connection.select().from(sinkingFunds)
      .where(accountIds ? inArray(sinkingFunds.accountId, accountIds) : undefined),
    connection.select(getTableColumns(sinkingFundEntries))
      .from(sinkingFundEntries)
      .innerJoin(sinkingFunds, eq(sinkingFunds.id, sinkingFundEntries.fundId))
      .where(accountIds ? inArray(sinkingFunds.accountId, accountIds) : undefined),
    connection.select({
      accountId: goalContributions.accountId,
      amount: sql<number>`sum(${goalContributions.amount})`.mapWith(Number),
    })
      .from(goalContributions)
      .where(accountIds ? inArray(goalContributions.accountId, accountIds) : undefined)
      .groupBy(goalContributions.accountId),
  ])
  const allocatedByFund = new Map<number, number>()
  for (const entry of entries)
    allocatedByFund.set(
      entry.fundId,
      sumMoney([allocatedByFund.get(entry.fundId) ?? 0, fundBalance([entry])]),
    )
  const reserved = new Map<number, number>()
  for (const fund of funds)
    reserved.set(
      fund.accountId,
      sumMoney([reserved.get(fund.accountId) ?? 0, allocatedByFund.get(fund.id) ?? 0]),
    )
  for (const contribution of contributions)
    reserved.set(
      contribution.accountId,
      sumMoney([reserved.get(contribution.accountId) ?? 0, contribution.amount]),
    )
  return { funds, entries, contributions, reserved }
}
