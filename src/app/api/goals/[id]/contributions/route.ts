import { sumMoney } from "@/lib/money"
import { asc, eq, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

import { accounts, goalContributions, goals } from "@/db/schema"
import { getToday, isDate } from "@/lib/finance"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { integerInput, moneyInput, recordInput, textInput } from "@/lib/planning-validation"
import { accountSummaryQuery, readReservedCash } from "@/lib/server/financial-queries"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const [goal] = await db.select().from(goals).where(eq(goals.id, id))
    if (!goal) throw new FinanceError("recordMissing", 404)
    return NextResponse.json(
      await db
        .select()
        .from(goalContributions)
        .where(eq(goalContributions.goalId, id))
        .orderBy(asc(goalContributions.date), asc(goalContributions.id)),
    )
  }, request)
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const goalId = integerInput((await params).id, 1, 2_147_483_647)
    const body = recordInput(await request.json())
    const amount = moneyInput(body.amount)
    const accountId = integerInput(body.accountId, 1, 2_147_483_647)
    const date = body.date ?? getToday()
    if (!isDate(date) || date > getToday())
      throw new FinanceError("invalidInput")
    const note = textInput(body.note, 500, false)
    const result = await db.transaction(async (connection) => {
      const [account] = await connection
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update")
      if (!account) throw new FinanceError("recordMissing", 404)
      const [goal] = await connection
        .select()
        .from(goals)
        .where(eq(goals.id, goalId))
        .for("update")
      if (!goal) throw new FinanceError("recordMissing", 404)
      const [contributions] = await connection
        .select({ amount: sql<number>`coalesce(sum(${goalContributions.amount}), 0)`.mapWith(Number) })
        .from(goalContributions)
        .where(eq(goalContributions.goalId, goalId))
      const progress =
        sumMoney([goal.currentAmount, contributions.amount])
      if (sumMoney([progress, amount]) > goal.targetAmount)
        throw new FinanceError("goalTargetExceeded", 409)
      const [summary] = await accountSummaryQuery(connection, [accountId])
      const reservations = await readReservedCash(connection, [accountId])
      const cash = summary.balance
      if (
        Math.round(cash * 100) -
          Math.round((reservations.reserved.get(accountId) ?? 0) * 100) <
        Math.round(amount * 100)
      )
        throw new FinanceError("insufficientAvailableCash", 409)
      const [contribution] = await connection
        .insert(goalContributions)
        .values({ goalId, accountId, amount, date, note })
        .returning()
      return contribution
    })
    return NextResponse.json(result, { status: 201 })
  })
}
