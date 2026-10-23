import { sql } from "drizzle-orm"
import { stockTrades } from "@/db/schema"
import { expenseCategories, incomeCategories, getCurrentMonth, getToday, getNextMonthStart } from "@/lib/finance"
import { getPreviousPeriod } from "@/lib/calculations"
import { calculateHoldings, investmentTotals } from "@/lib/investments"
import { monthlyFundSaving, projectNetWorth, scheduleOccurrences, simulateCashflow } from "@/lib/planning"
import { parseTransactionFilters } from "@/lib/transaction-filters"
import { readFinancialHealth } from "@/lib/server/financial-health-queries"
import { readSimulationBalance } from "@/lib/server/simulation-queries"
import { readBudgets } from "@/lib/server/budget-queries"
import { readBalanceLedger, readReservedCash, goalSummaryQuery, debtSummaryQuery } from "@/lib/server/financial-queries"
import { readReservations } from "@/lib/server/ledger"
import { readLatestPrices } from "@/lib/server/market-queries"
import { transactionConditions } from "@/lib/server/transaction-conditions"
import { recurringSchedulesQuery } from "@/lib/server/recurring-queries"
import type { UserDatabase } from "@/lib/server/authenticated-response"
import type { InsightContext } from "./insight-contract"
import { healthInsightSummary } from "./financial-health"

type Connection = UserDatabase
function periodEnd(month: string) {
  const end = new Date(getNextMonthStart(month) + "T00:00:00Z")
  end.setUTCDate(end.getUTCDate() - 1)
  return end.toISOString().slice(0, 10)
}

async function transactionSummary(connection: Connection, filters: string) {
  const parsed = parseTransactionFilters(new URLSearchParams(filters))!
  const where = transactionConditions(parsed) ?? sql`true`
  const { rows } = await connection.execute<{ data: Record<string, unknown> }>(sql`
    with filtered as (select type, amount, category, date from transactions where ${where}),
    categories as (
      select case when category in (${sql.join([...expenseCategories, ...incomeCategories].map((category) => sql`${category}`), sql`, `)}) then category else 'Other' end as category,
        type, sum(amount) as amount, count(*) as count from filtered where type <> 'transfer' group by 1, type
    )
    select json_build_object(
      'transactionCount', count(*), 'income', coalesce(sum(amount) filter (where type = 'income'), 0),
      'expense', coalesce(sum(amount) filter (where type = 'expense'), 0),
      'transferCount', count(*) filter (where type = 'transfer'),
      'largestExpense', max(amount) filter (where type = 'expense'),
      'from', min(date), 'to', max(date),
      'categories', coalesce((select json_agg(c) from (select * from categories order by amount desc limit 10) c), '[]'::json)
    ) as data from filtered`)
  return { ...rows[0].data, filtered: Boolean(filters), requestedFrom: parsed.from || null, requestedTo: parsed.to || null }
}

async function portfolioSummary(connection: Connection) {
  const trades = await connection.select().from(stockTrades)
  const prices = await readLatestPrices(connection, trades.map((trade) => trade.symbol))
  const holdings = calculateHoldings(trades, prices)
  const active = holdings.filter((holding) => holding.shares > 0)
  const totals = investmentTotals(holdings)
  const bySymbol = new Map<string, number>()
  for (const holding of active) bySymbol.set(holding.symbol, (bySymbol.get(holding.symbol) ?? 0) + (holding.marketValue ?? 0))
  return { ...totals, holdingCount: bySymbol.size,
    largestHoldingShare: totals.marketValue && totals.marketValue > 0 ? Math.max(0, ...bySymbol.values()) / totals.marketValue : null,
    oldestPriceDate: active.map((holding) => holding.priceDate).filter((date): date is string => Boolean(date)).sort()[0] ?? null }
}

async function cashSummary(connection: Connection) {
  const [ledger, reservations] = await Promise.all([readBalanceLedger(connection), readReservedCash(connection)])
  const reservedCash = [...reservations.reserved.values()].reduce((total, amount) => total + amount, 0)
  return { cash: ledger.cashBalance, reservedCash, availableCash: ledger.cashBalance - reservedCash, accountCount: ledger.accounts.length }
}

async function debtSummary(connection: Connection) {
  const rows = await debtSummaryQuery(connection)
  const debt = rows.filter((row) => row.type === "utang" && row.remaining > 0)
  const receivables = rows.filter((row) => row.type === "piutang" && row.remaining > 0)
  const total = (items: typeof rows) => items.reduce((sum, row) => sum + row.remaining, 0)
  return { liabilities: total(debt), receivables: total(receivables), outstandingDebtCount: debt.length,
    overdueDebt: total(debt.filter((row) => row.dueDate && row.dueDate < getToday())),
    overdueReceivables: total(receivables.filter((row) => row.dueDate && row.dueDate < getToday())),
    nextDueDate: debt.map((row) => row.dueDate).filter((date): date is string => Boolean(date)).sort()[0] ?? null }
}

export async function readInsightSummary(connection: Connection, context: InsightContext) {
  const today = getToday()
  const page = context.page
  if (page === "transactions") return transactionSummary(connection, context.filters)
  if (page === "financialHealth") return healthInsightSummary(await readFinancialHealth(connection, context.input))
  if (page === "investments") return portfolioSummary(connection)
  if (page === "debts") return debtSummary(connection)
  if (page === "budget") {
    const month = context.month
    const rows = await readBudgets(connection, month + "-01", getNextMonthStart(month), getPreviousPeriod(month) + "-01")
    return { month, provisional: month === getCurrentMonth(), budgetCount: rows.length,
      elapsedMonthFraction: month === getCurrentMonth() ? Number(today.slice(-2)) / Number(periodEnd(month).slice(-2)) : null,
      totalBudget: rows.reduce((sum, row) => sum + row.effectiveBudget, 0), totalSpent: rows.reduce((sum, row) => sum + row.spent, 0),
      categories: rows.slice(0, 30).map((row) => ({ category: (expenseCategories as readonly string[]).includes(row.category) ? row.category : "Other",
        effectiveBudget: row.effectiveBudget, spent: row.spent, remaining: row.effectiveBudget - row.spent,
        spentShare: row.effectiveBudget > 0 ? row.spent / row.effectiveBudget : null })), omittedCount: Math.max(0, rows.length - 30) }
  }
  if (page === "goals") {
    const goals = await goalSummaryQuery(connection)
    return { ...await cashSummary(connection), goalCount: goals.length,
      totalTarget: goals.reduce((sum, goal) => sum + goal.targetAmount, 0), totalAllocated: goals.reduce((sum, goal) => sum + goal.currentAmount, 0),
      monthlySavingNeeded: goals.reduce((sum, goal) => sum + monthlyFundSaving(goal.targetAmount, goal.currentAmount, goal.targetDate, today), 0),
      overdueIncompleteCount: goals.filter((goal) => goal.targetDate < today && goal.currentAmount < goal.targetAmount).length }
  }
  if (page === "funds") {
    const reservations = await readReservations(connection)
    const allocations = new Map<number, number>()
    for (const entry of reservations.entries) allocations.set(entry.fundId, (allocations.get(entry.fundId) ?? 0) + (entry.kind === "allocate" ? entry.amount : -entry.amount))
    return { ...await cashSummary(connection), fundCount: reservations.funds.length,
      totalTarget: reservations.funds.reduce((sum, fund) => sum + fund.targetAmount, 0),
      totalAllocated: [...allocations.values()].reduce((sum, value) => sum + value, 0),
      monthlySavingNeeded: reservations.funds.reduce((sum, fund) => sum + monthlyFundSaving(fund.targetAmount, allocations.get(fund.id) ?? 0, fund.targetDate, today), 0),
      overdueIncompleteCount: reservations.funds.filter((fund) => fund.targetDate < today && (allocations.get(fund.id) ?? 0) < fund.targetAmount).length }
  }
  if (page === "netWorth") {
    const [cash, portfolio, debt] = await Promise.all([cashSummary(connection), portfolioSummary(connection), debtSummary(connection)])
    return { ...cash, portfolio, ...debt, knownNetWorth: cash.cash + portfolio.knownMarketValue + debt.receivables - debt.liabilities,
      netWorth: portfolio.unpricedCount ? null : cash.cash + portfolio.knownMarketValue + debt.receivables - debt.liabilities }
  }
  if (page === "calendar") {
    const from = context.month + "-01", to = periodEnd(context.month)
    const [schedules, debtRows, reservations] = await Promise.all([recurringSchedulesQuery(connection), debtSummaryQuery(connection), readReservations(connection)])
    const occurrences = schedules.flatMap((schedule) => scheduleOccurrences(schedule, from, to))
    const byType = (type: string) => occurrences.filter((item) => item.type === type).reduce((sum, item) => sum + item.amount, 0)
    return { month: context.month, pendingOccurrenceCount: occurrences.length, scheduledIncome: byType("income"), scheduledExpense: byType("expense"),
      debtDue: debtRows.filter((row) => row.type === "utang" && row.dueDate && row.dueDate >= from && row.dueDate <= to).reduce((sum, row) => sum + row.remaining, 0),
      fundTargetDue: reservations.funds.filter((fund) => fund.targetDate >= from && fund.targetDate <= to).reduce((sum, fund) => sum + fund.targetAmount, 0) }
  }
  if (page === "simulation") {
    const [balance, schedules] = await Promise.all([
      readSimulationBalance(connection),
      recurringSchedulesQuery(connection),
    ])
    const input = context.input
    const named = (items: typeof input.extraIncomes) => items.map((item) => ({ ...item, name: "Scenario" }))
    const cashflow = simulateCashflow(balance.currentBalance, schedules, today, input.endDate, named(input.extraIncomes), named(input.extraExpenses))
    return { endDate: input.endDate, forecastOnly: true,
      ...projectNetWorth(cashflow, balance),
      netWorthAssumption: "Gross worth uses the purchase cost of stocks still held, including buy fees. Net worth uses stock market value. Both keep stock costs, market values, receivables and liabilities fixed; only cash changes. Missing market prices make only net worth incomplete." }
  }
  if (page === "planning") {
    const [ledger, schedules] = await Promise.all([readBalanceLedger(connection), recurringSchedulesQuery(connection)])
    return { endDate: context.endDate, forecastOnly: true, ...simulateCashflow(ledger.cashBalance, schedules, today, context.endDate, [], []) }
  }
  const month = page === "reports" ? context.month : getCurrentMonth()
  const [transactions, health] = await Promise.all([
    transactionSummary(connection, new URLSearchParams({ from: month + "-01", to: periodEnd(month) }).toString()),
    readFinancialHealth(connection, { month, essentialExpense: null, monthlyDebtPayment: null }),
  ])
  return { month, transactions, financialHealth: healthInsightSummary(health) }
}
