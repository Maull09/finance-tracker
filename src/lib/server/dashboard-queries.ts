import { sql } from "drizzle-orm"
import type { UserDatabase } from "./authenticated-response"
import { tradeCashSql } from "./financial-queries"

type DashboardLedger = {
  startingBalance: number
  cashBalance: number
  transactions: Array<{ date: string; type: "income" | "expense"; category: string; amount: number }>
  trades: Array<{ date: string; cashChange: number }>
  openingChange: number
}

export async function readDashboardLedger(
  connection: Pick<UserDatabase, "execute">,
  range: { historyStart: string; historyEnd: string; previousStart: string; periodEnd: string; recentStart: string; today: string },
) {
  const netAmount = sql`case when type = 'income' then amount when type = 'expense' then -amount else 0 end`
  const result = await connection.execute<{ ledger: DashboardLedger }>(sql`
    with daily as (
      select date, type, category, sum(amount) as amount, min(id) as first_id
      from transactions
      where type in ('income', 'expense') and (
        (date >= ${range.historyStart} and date < ${range.historyEnd}) or
        (date >= ${range.previousStart} and date < ${range.periodEnd}) or
        (date >= ${range.recentStart} and date <= ${range.today})
      )
      group by date, type, category
    ), monthly_trades as (
      select to_char(${sql.identifier("date")}, 'YYYY-MM') || '-01' as date,
        sum(${tradeCashSql}) as "cashChange"
      from stock_trades
      where date >= ${range.historyStart} and date < ${range.historyEnd}
      group by to_char(${sql.identifier("date")}, 'YYYY-MM')
    ), totals as (
      select
        coalesce((select sum(initial_balance) from accounts), 0) as initial,
        coalesce((select sum(${netAmount}) from transactions), 0) as transactions,
        coalesce((select sum(${tradeCashSql}) from stock_trades), 0) as trades,
        coalesce((select sum(${netAmount}) from transactions where date < ${range.historyStart}), 0) +
        coalesce((select sum(${tradeCashSql}) from stock_trades where date < ${range.historyStart}), 0) as opening
    )
    select json_build_object(
      'startingBalance', initial,
      'cashBalance', initial + transactions + trades,
      'openingChange', opening,
      'transactions', coalesce((select json_agg(daily order by first_id) from daily), '[]'::json),
      'trades', coalesce((select json_agg(monthly_trades) from monthly_trades), '[]'::json)
    ) as ledger from totals
  `)
  return result.rows[0].ledger
}
