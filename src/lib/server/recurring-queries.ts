import { getTableColumns, sql } from "drizzle-orm"
import { accounts, recurringTransactions, transactions } from "@/db/schema"
import type { UserDatabase } from "./authenticated-response"

export function recurringSchedulesQuery(connection: Pick<UserDatabase, "select">) {
  // Keep outer references literal so Drizzle preserves their table qualifiers.
  return connection.select({
    ...getTableColumns(recurringTransactions),
    accountName: sql<string | null>`(select ${accounts.name} from ${accounts} where ${accounts.id} = "recurring_transactions"."account_id")`,
    recordedDates: sql<string[]>`(
      select coalesce(array_agg(${transactions.scheduledDate}::text), '{}'::text[])
      from ${transactions} where ${transactions.recurringId} = "recurring_transactions"."id"
    )`,
  }).from(recurringTransactions)
}
