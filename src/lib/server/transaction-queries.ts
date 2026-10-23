import { sql, type SQL } from "drizzle-orm"
import { transactions } from "@/db/schema"
import type { UserDatabase } from "./authenticated-response"
import type { TransactionGroupSummary } from "@/lib/types"

type TransactionPage = {
  items: Array<Omit<typeof transactions.$inferSelect, "createdAt"> & { createdAt: string | null }>
  page: number
  limit: number
  total: number
  totalPages: number
  summary: { income: number; expense: number }
  groups: TransactionGroupSummary[]
}

export async function readTransactionPage(
  connection: Pick<UserDatabase, "execute">,
  where: SQL | undefined,
  page: number,
  limit: number,
) {
  const result = await connection.execute<{ data: TransactionPage }>(sql`
    with filtered as (
      select * from transactions where ${where ?? sql`true`}
    ), grouped as (
      select group_name, count(*) as count,
        coalesce(sum(amount) filter (where type = 'income'), 0) as income,
        coalesce(sum(amount) filter (where type = 'expense'), 0) as expense
      from filtered group by group_name
    ), summary as (
      select count(*) as total,
        coalesce(sum(amount) filter (where type = 'income'), 0) as income,
        coalesce(sum(amount) filter (where type = 'expense'), 0) as expense
      from filtered
    ), pagination as (
      select *, greatest(1, ceil(total::numeric / ${limit})) as pages,
        least(${page}, greatest(1, ceil(total::numeric / ${limit}))) as page
      from summary
    )
    select json_build_object(
      'items', coalesce((select json_agg(json_build_object(
        'id', item.id, 'userId', item.user_id, 'type', item.type,
        'amount', item.amount, 'category', item.category, 'description', item.description,
        'groupName', item.group_name, 'subcategory', item.subcategory,
        'recurringId', item.recurring_id, 'scheduledDate', item.scheduled_date,
        'date', item.date, 'accountId', item.account_id,
        'destinationAccountId', item.destination_account_id,
        'createdAt', to_char(item.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) order by item.date desc, item.id desc) from (
        select * from filtered
        order by date desc, id desc limit ${limit}
        offset ((select page from pagination) - 1) * ${limit}
      ) item), '[]'::json),
      'page', page, 'limit', ${limit}::integer, 'total', total, 'totalPages', pages,
      'summary', json_build_object('income', income, 'expense', expense),
      'groups', coalesce((select json_agg(json_build_object(
        'groupName', group_name, 'count', count, 'income', income, 'expense', expense
      ) order by expense desc, group_name nulls last) from grouped), '[]'::json)
    ) as data from pagination
  `)
  return result.rows[0].data
}
