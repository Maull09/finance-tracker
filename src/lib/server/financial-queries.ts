import { sumMoney } from "@/lib/money"
import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm"
import {
  accounts,
  debtPayments,
  debts,
  goalContributions,
  goals,
  sinkingFundEntries,
  sinkingFunds,
  stockTrades,
  transactions,
} from "@/db/schema"
import type { ReadConnection } from "./ledger"

// Round each trade before summing, matching tradeCashChange's cent precision.
export const tradeCashSql = sql`case when ${stockTrades.side} = 'buy'
  then -round(${stockTrades.shares} * ${stockTrades.price}, 2) - ${stockTrades.fees}
  else round(${stockTrades.shares} * ${stockTrades.price}, 2) - ${stockTrades.fees} end`

export function accountSummaryQuery(connection: ReadConnection, accountIds?: number[]) {
  const outgoing = connection
    .select({
      accountId: transactions.accountId,
      amount: sql<number>`sum(case when ${transactions.type} = 'income' then ${transactions.amount} else -${transactions.amount} end)`.as("outgoing_amount"),
    })
    .from(transactions)
    .where(accountIds ? inArray(transactions.accountId, accountIds) : undefined)
    .groupBy(transactions.accountId)
    .as("outgoing")
  const incoming = connection
    .select({
      accountId: transactions.destinationAccountId,
      amount: sql<number>`sum(${transactions.amount})`.as("incoming_amount"),
    })
    .from(transactions)
    .where(and(
      eq(transactions.type, "transfer"),
      accountIds ? inArray(transactions.destinationAccountId, accountIds) : undefined,
    ))
    .groupBy(transactions.destinationAccountId)
    .as("incoming")
  const trades = connection
    .select({
      accountId: stockTrades.accountId,
      amount: sql<number>`sum(${tradeCashSql})`.as("trade_amount"),
    })
    .from(stockTrades)
    .where(accountIds ? inArray(stockTrades.accountId, accountIds) : undefined)
    .groupBy(stockTrades.accountId)
    .as("trade_totals")

  return connection
    .select({
      ...getTableColumns(accounts),
      balance: sql<number>`round(${accounts.initialBalance} + coalesce(${outgoing.amount}, 0) + coalesce(${incoming.amount}, 0) + coalesce(${trades.amount}, 0), 2)`.mapWith(Number),
    })
    .from(accounts)
    .leftJoin(outgoing, eq(outgoing.accountId, accounts.id))
    .leftJoin(incoming, eq(incoming.accountId, accounts.id))
    .leftJoin(trades, eq(trades.accountId, accounts.id))
    .where(accountIds ? inArray(accounts.id, accountIds) : undefined)
    .orderBy(asc(accounts.id))
}

export async function readBalanceLedger(connection: ReadConnection) {
  const summaries = await accountSummaryQuery(connection)
  return {
    accounts: summaries,
    summaries,
    cashBalance: summaries.reduce(
      (total, account) => total + Math.round(account.balance * 100), 0,
    ) / 100,
  }
}

export function debtSummaryQuery(connection: ReadConnection) {
  const payments = connection
    .select({
      debtId: debtPayments.debtId,
      amount: sql<number>`sum(${debtPayments.amount})`.as("paid_total"),
    })
    .from(debtPayments)
    .groupBy(debtPayments.debtId)
    .as("payment_totals")
  return connection
    .select({
      ...getTableColumns(debts),
      paidAmount: sql<number>`coalesce(${payments.amount}, case when ${debts.status} = 'paid' then ${debts.amount} else 0 end)`.mapWith(Number),
      remaining: sql<number>`greatest(0, ${debts.amount} - coalesce(${payments.amount}, 0))`.mapWith(Number),
    })
    .from(debts)
    .leftJoin(payments, eq(payments.debtId, debts.id))
    .orderBy(asc(debts.dueDate))
}

export function goalSummaryQuery(connection: ReadConnection) {
  const contributions = connection
    .select({
      goalId: goalContributions.goalId,
      amount: sql<number>`sum(${goalContributions.amount})`.as("contributed_total"),
    })
    .from(goalContributions)
    .groupBy(goalContributions.goalId)
    .as("contribution_totals")
  return connection
    .select({
      ...getTableColumns(goals),
      currentAmount: sql<number>`${goals.currentAmount} + coalesce(${contributions.amount}, 0)`.mapWith(Number),
    })
    .from(goals)
    .leftJoin(contributions, eq(contributions.goalId, goals.id))
    .orderBy(asc(goals.id))
}

export async function readReservedCash(connection: ReadConnection, accountIds?: number[]) {
  const funds = connection
    .select({
      accountId: sinkingFunds.accountId,
      amount: sql<number>`coalesce(sum(case when ${sinkingFundEntries.kind} = 'allocate' then ${sinkingFundEntries.amount} else -${sinkingFundEntries.amount} end), 0)`.mapWith(Number),
    })
    .from(sinkingFunds)
    .leftJoin(sinkingFundEntries, eq(sinkingFundEntries.fundId, sinkingFunds.id))
    .where(accountIds ? inArray(sinkingFunds.accountId, accountIds) : undefined)
    .groupBy(sinkingFunds.accountId)
  const contributions = connection
    .select({
      accountId: goalContributions.accountId,
      amount: sql<number>`sum(${goalContributions.amount})`.mapWith(Number),
    })
    .from(goalContributions)
    .where(accountIds ? inArray(goalContributions.accountId, accountIds) : undefined)
    .groupBy(goalContributions.accountId)
  const rows = await funds.unionAll(contributions)
  const reserved = new Map<number, number>()
  for (const row of rows)
    reserved.set(row.accountId, sumMoney([reserved.get(row.accountId) ?? 0, row.amount]))
  return { reserved }
}
