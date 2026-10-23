import { NextRequest, NextResponse } from "next/server"
import { recurringTransactions } from "@/db/schema"
import { and, lte, gte, isNull, or } from "drizzle-orm"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { parseSimulation } from "@/lib/planning-validation"
import { projectNetWorth, simulateCashflow } from "@/lib/planning"
import { getToday } from "@/lib/finance"
import { readSimulationBalance } from "@/lib/server/simulation-queries"
import { recurringSchedulesQuery } from "@/lib/server/recurring-queries"

export async function GET(request: Request) {
  return authenticatedResponse(async (db) => {
    return NextResponse.json(await readSimulationBalance(db))
  }, request)
}

export async function POST(request: NextRequest) {
  return authenticatedResponse(async (db) => {
    const input = parseSimulation(await request.json())
    const today = getToday()
    const [balance, schedules] = await Promise.all([
      readSimulationBalance(db),
      recurringSchedulesQuery(db).where(and(
        lte(recurringTransactions.startDate, input.endDate),
        or(isNull(recurringTransactions.endDate), gte(recurringTransactions.endDate, today)),
      )),
    ])
    return NextResponse.json({
      ...input,
      ...projectNetWorth(simulateCashflow(
        balance.currentBalance,
        schedules,
        today,
        input.endDate,
        input.extraIncomes,
        input.extraExpenses,
      ), balance),
    })
  })
}
