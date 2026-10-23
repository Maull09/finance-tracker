import { eq, sql } from "drizzle-orm"
import { recurringTransactions, transactions } from "@/db/schema"
import { FinanceError } from "@/lib/finance-errors"
import { scheduleOccurrences } from "@/lib/planning"
import type { parseOccurrenceRecording } from "@/lib/planning-validation"
import type { UserDatabase } from "./authenticated-response"
import { recurringSchedulesQuery } from "./recurring-queries"

export async function recordRecurringOccurrence(
  connection: UserDatabase,
  id: number,
  input: ReturnType<typeof parseOccurrenceRecording>,
) {
  const [locked] = await connection.select({ id: recurringTransactions.id })
    .from(recurringTransactions).where(eq(recurringTransactions.id, id)).for("update")
  if (!locked) throw new FinanceError("recordMissing", 404)
  const [schedule] = await recurringSchedulesQuery(connection).where(eq(recurringTransactions.id, id))
  const occurrence = scheduleOccurrences(
    { ...schedule, recordedThroughDate: null, recordedDates: [] }, input.scheduledDate, input.scheduledDate,
  )[0]
  if (!occurrence) throw new FinanceError("scheduleUnavailable", 409)
  if ((schedule.recordedThroughDate && input.scheduledDate <= schedule.recordedThroughDate) ||
      schedule.recordedDates.includes(input.scheduledDate))
    throw new FinanceError("scheduleAlreadyRecorded", 409)

  const [transaction] = await connection.insert(transactions).values({
    type: schedule.type,
    amount: input.amount,
    category: schedule.category,
    subcategory: schedule.subcategory,
    description: schedule.description,
    date: input.date,
    recurringId: id,
    scheduledDate: input.scheduledDate,
    accountId: schedule.accountId,
    destinationAccountId: schedule.destinationAccountId,
  }).returning()
  await connection.update(recurringTransactions).set({
    lastExecutedDate: sql`greatest(${recurringTransactions.lastExecutedDate}, ${input.date}::date)`,
  }).where(eq(recurringTransactions.id, id))
  return transaction
}
