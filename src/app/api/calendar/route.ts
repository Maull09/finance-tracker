import { NextRequest, NextResponse } from "next/server"
import { and, gte, lte, isNull, or } from "drizzle-orm"
import {
  recurringTransactions,
  debts,
  sinkingFunds,
} from "@/db/schema"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { isMonth, getNextMonthStart } from "@/lib/finance"
import { scheduleOccurrences } from "@/lib/planning"
import { debtSummaryQuery } from "@/lib/server/financial-queries"
import { recurringSchedulesQuery } from "@/lib/server/recurring-queries"
import type { CalendarEvent } from "@/lib/planning-types"

export async function GET(request: NextRequest) {
  return authenticatedResponse(async (db) => {
    const month = new URL(request.url).searchParams.get("month")
    if (
      !isMonth(month) ||
      Number(month.slice(0, 4)) < 1900 ||
      Number(month.slice(0, 4)) > 2100
    )
      throw new FinanceError("invalidInput")
    const from = month + "-01"
    const end = new Date(getNextMonthStart(month) + "T00:00:00Z")
    end.setUTCDate(end.getUTCDate() - 1)
    const to = end.toISOString().slice(0, 10)
    const [schedules, obligations, funds] = await Promise.all([
      recurringSchedulesQuery(db).where(and(
        lte(recurringTransactions.startDate, to),
        or(isNull(recurringTransactions.endDate), gte(recurringTransactions.endDate, from)),
      )),
      debtSummaryQuery(db).where(and(gte(debts.dueDate, from), lte(debts.dueDate, to))),
      db.select().from(sinkingFunds).where(and(gte(sinkingFunds.targetDate, from), lte(sinkingFunds.targetDate, to))),
    ])
    const events: CalendarEvent[] = schedules.flatMap((schedule) =>
      scheduleOccurrences(schedule, from, to).map((item) => ({
        ...item,
        id: `schedule-${item.scheduleId}-${item.date}`,
        accountName: schedule.accountName,
        source: "recurring",
      })),
    )
    for (const debt of obligations) {
      const remaining = debt.remaining
      if (
        debt.dueDate &&
        debt.dueDate >= from &&
        debt.dueDate <= to &&
        remaining > 0
      )
        events.push({
          id: `debt-${debt.id}`,
          name: debt.name,
          type: debt.type === "utang" ? "debtDue" : "receivableDue",
          amount: remaining,
          date: debt.dueDate,
          source: "debts",
        })
    }
    for (const fund of funds)
      if (fund.targetDate >= from && fund.targetDate <= to)
        events.push({
          id: `fund-${fund.id}`,
          name: fund.name,
          type: "fundDue",
          amount: fund.targetAmount,
          date: fund.targetDate,
          source: "funds",
        })
    return NextResponse.json({
      month,
      events: events.sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      ),
    })
  }, request)
}
