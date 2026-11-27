import { sumMoney } from "@/lib/money"
import { NextRequest, NextResponse } from "next/server"
import { goalContributions, goals } from "@/db/schema"
import { eq } from "drizzle-orm"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { integerInput, parseGoal } from "@/lib/planning-validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const input = parseGoal(await req.json())
    const result = await db.transaction(async (connection) => {
      const [goal] = await connection
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .for("update")
      if (!goal) throw new FinanceError("recordMissing", 404)
      const contributions = await connection
        .select()
        .from(goalContributions)
        .where(eq(goalContributions.goalId, id))
      const progress =
        sumMoney([goal.currentAmount, ...contributions.map((item) => item.amount)])
      if (input.targetAmount < progress)
        throw new FinanceError("amountBelowRecorded", 409)
      const [updated] = await connection
        .update(goals)
        .set(input)
        .where(eq(goals.id, id))
        .returning()
      return updated
    })
    return NextResponse.json(result)
  })
}

export async function DELETE(_: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    await db.transaction(async (connection) => {
      const [goal] = await connection
        .select()
        .from(goals)
        .where(eq(goals.id, id))
        .for("update")
      if (!goal) throw new FinanceError("recordMissing", 404)
      const [history] = await connection
        .select()
        .from(goalContributions)
        .where(eq(goalContributions.goalId, id))
        .limit(1)
      if (history) throw new FinanceError("historyProtected", 409)
      await connection.delete(goals).where(eq(goals.id, id))
    })
    return NextResponse.json({ id })
  })
}
