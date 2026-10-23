import { and, lte, sql } from "drizzle-orm"
import { recurringTransactions, stockPrices, stockTrades } from "@/db/schema"
import { calculateFinancialHealth, healthPeriod, type HealthInput, type HealthMonth } from "@/lib/financial-health"
import { calculateHoldings, investmentTotals } from "@/lib/investments"
import { getCurrentMonth } from "@/lib/finance"
import { FinanceError } from "@/lib/finance-errors"
import { scheduleOccurrences } from "@/lib/planning"
import type { UserDatabase } from "./authenticated-response"
import { tradeCashSql } from "./financial-queries"

type HealthLedger = {
  months: HealthMonth[]
  cashAssets: number
  liquidAssets: number
  overdrafts: number
  liabilities: number
  receivables: number
  recordedDebtPayments: number
}

export async function readFinancialHealth(connection: UserDatabase, input: HealthInput) {
  const period = healthPeriod(input.month)
  const [result, trades, schedules] = await Promise.all([
    connection.execute<{ ledger: HealthLedger }>(sql`
      with monthly_categories as (
        select to_char(t.date, 'YYYY-MM') as month, t.type, t.category,
          sum(t.amount) as amount, count(*) as count
        from transactions t
        where t.date >= ${period.historyStart} and t.date <= ${period.asOf}
          and not exists (select 1 from debt_payments p join debts d on d.id = p.debt_id
            where p.transaction_id = t.id and d.type = 'piutang')
        group by 1, 2, 3
      ), monthly as (
        select month,
          coalesce(sum(amount) filter (where type = 'income'), 0) as income,
          coalesce(sum(amount) filter (where type = 'expense'), 0) as expense,
          coalesce(sum(count) filter (where type <> 'transfer'), 0) as count,
          coalesce(sum(count) filter (where type = 'transfer'), 0) as transfers,
          coalesce(max(amount) filter (where type = 'income'), 0) as "largestIncomeCategory"
        from monthly_categories group by month
      ), movements as (
        select account_id, sum(case when type = 'income' then amount::bigint else -amount::bigint end) as amount
        from transactions where date <= ${period.asOf} group by account_id
        union all
        select destination_account_id, sum(amount) from transactions
        where type = 'transfer' and date <= ${period.asOf} group by destination_account_id
        union all
        select account_id, sum(${tradeCashSql}) from stock_trades
        where date <= ${period.asOf} group by account_id
      ), reserved as (
        select f.account_id, sum(case when e.kind = 'allocate' then e.amount else -e.amount end) as amount
        from sinking_funds f join sinking_fund_entries e on e.fund_id = f.id
        where e.date <= ${period.asOf} group by f.account_id
        union all
        select account_id, sum(amount) from goal_contributions where date <= ${period.asOf} group by account_id
      ), balances as (
        select a.id, a.type, a.initial_balance + coalesce((select sum(m.amount) from movements m where m.account_id = a.id), 0) as balance,
          coalesce((select sum(r.amount) from reserved r where r.account_id = a.id), 0) as reserved
        from accounts a
      ), debt_balances as (
        select d.type, greatest(0, d.amount - coalesce(
          (select sum(p.amount) from debt_payments p where p.debt_id = d.id and p.date <= ${period.asOf}),
          case when d.status = 'paid' and d.paid_date <= ${period.asOf} then d.amount else 0 end
        )) as remaining
        from debts d where d.created_at < (${period.asOf}::date + interval '1 day') at time zone 'Asia/Jakarta'
      )
      select json_build_object(
        'months', (select json_agg(json_build_object(
          'month', to_char(month_date, 'YYYY-MM'), 'income', coalesce(m.income, 0),
          'expense', coalesce(m.expense, 0), 'count', coalesce(m.count, 0),
          'transfers', coalesce(m.transfers, 0), 'largestIncomeCategory', coalesce(m."largestIncomeCategory", 0)
        ) order by month_date) from generate_series(${period.historyStart}::date, ${period.start}::date, interval '1 month') month_date
          left join monthly m on m.month = to_char(month_date, 'YYYY-MM')),
        'cashAssets', coalesce((select sum(greatest(balance, 0)) from balances), 0),
        'liquidAssets', greatest(0, coalesce((select sum(balance - reserved) from balances where type in ('cash', 'bank', 'ewallet')), 0)),
        'overdrafts', coalesce((select sum(greatest(-balance, 0)) from balances), 0),
        'liabilities', coalesce((select sum(remaining) from debt_balances where type = 'utang'), 0),
        'receivables', coalesce((select sum(remaining) from debt_balances where type = 'piutang'), 0),
        'recordedDebtPayments', coalesce((select sum(p.amount) from debt_payments p join debts d on d.id = p.debt_id
          where d.type = 'utang' and p.date >= ${period.start} and p.date <= ${period.asOf}), 0)
      ) as ledger
    `),
    connection.select().from(stockTrades).where(lte(stockTrades.date, period.asOf)),
    connection.select().from(recurringTransactions).where(lte(recurringTransactions.startDate, period.asOf)),
  ])
  const symbols = [...new Set(trades.map((trade) => trade.symbol))]
  const prices = symbols.length ? await connection.selectDistinctOn([stockPrices.symbol]).from(stockPrices)
    .where(and(lte(stockPrices.date, period.asOf), sql`${stockPrices.symbol} = any(${sql.param(symbols)}::text[])`))
    .orderBy(stockPrices.symbol, sql`${stockPrices.date} desc`) : []
  const holdings = calculateHoldings(trades, prices)
  const investments = investmentTotals(holdings)
  const ledger = result.rows[0].ledger
  if (input.monthlyDebtPayment !== null && input.monthlyDebtPayment < ledger.recordedDebtPayments)
    throw new FinanceError("invalidInput")
  const recurringExpense = schedules.filter((row) => row.type === "expense")
    .flatMap((schedule) => scheduleOccurrences({ ...schedule, recordedThroughDate: null }, period.start, period.asOf))
    .reduce((sum, row) => sum + row.amount, 0)
  const priceDates = holdings.filter((holding) => holding.shares > 0 && holding.priceDate !== null)
    .map((holding) => holding.priceDate!).sort()
  return calculateFinancialHealth({
    month: input.month,
    asOf: period.asOf,
    partial: input.month === getCurrentMonth(),
    months: ledger.months,
    liquidAssets: ledger.liquidAssets,
    totalAssets: investments.unpricedCount ? null : ledger.cashAssets + investments.knownMarketValue + ledger.receivables,
    totalLiabilities: ledger.liabilities + ledger.overdrafts,
    recordedDebtPayments: ledger.recordedDebtPayments,
    recurringExpense,
    unpricedHoldings: investments.unpricedCount,
    oldestPriceDate: priceDates[0] ?? null,
  }, input)
}
