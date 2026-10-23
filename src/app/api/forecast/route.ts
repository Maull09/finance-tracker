import { NextRequest, NextResponse } from "next/server"
import { and, lte, gte, isNull, or } from "drizzle-orm"

import { recurringTransactions } from "@/db/schema"
import { calculateForecast } from "@/lib/calculations"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { getToday, isDate } from "@/lib/finance"
import { readBalanceLedger } from "@/lib/server/financial-queries"
import { scheduleOccurrences } from "@/lib/planning"
import { recurringSchedulesQuery } from "@/lib/server/recurring-queries"

export async function GET(request: NextRequest) {
  return authenticatedResponse(async (db) => {
    const payday = new URL(request.url).searchParams.get("payday")
    const today = getToday()

    if (!isDate(payday) || payday < today)
      return NextResponse.json({ code: "invalidInput" }, { status: 400 })

    const [ledger, recurring] = await Promise.all([
      readBalanceLedger(db),
      recurringSchedulesQuery(db).where(and(
        lte(recurringTransactions.startDate, payday),
        or(isNull(recurringTransactions.endDate), gte(recurringTransactions.endDate, today)),
      )),
    ])
    const currentBalance = ledger.cashBalance
    const scheduled = recurring.flatMap((item) =>
      scheduleOccurrences(item, today, payday),
    )
    const forecastBalance = calculateForecast(
      currentBalance,
      scheduled.map((item) => ({
        ...item,
        type: item.type as "income" | "expense" | "transfer",
      })),
    )

    return NextResponse.json({
      payday,
      currentBalance,
      forecastBalance,
      scheduled,
    })
  }, request)
}
