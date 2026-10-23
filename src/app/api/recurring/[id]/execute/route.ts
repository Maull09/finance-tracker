import { eq } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

import { recurringTransactions, transactions } from "@/db/schema"
import { getToday } from "@/lib/finance"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { integerInput } from "@/lib/planning-validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const today = getToday()
    const result = await db.transaction(async (connection) => {
      const [recurring] = await connection
        .select()
        .from(recurringTransactions)
        .where(eq(recurringTransactions.id, id))
        .for("update")
      if (!recurring) throw new FinanceError("recordMissing", 404)
      if (
        recurring.startDate > today ||
        (recurring.endDate && recurring.endDate < today)
      )
        throw new FinanceError("scheduleUnavailable", 409)
      if (recurring.lastExecutedDate === today)
        throw new FinanceError("scheduleAlreadyRecorded", 409)
      const [transaction] = await connection
        .insert(transactions)
        .values({
          type: recurring.type,
          amount: recurring.amount,
          category: recurring.category,
          subcategory: recurring.subcategory,
          description: recurring.description,
          date: today,
          accountId: recurring.accountId,
          destinationAccountId: recurring.destinationAccountId,
        })
        .returning()
      await connection
        .update(recurringTransactions)
        .set({ lastExecutedDate: today })
        .where(eq(recurringTransactions.id, id))
      return transaction
    })
    return NextResponse.json(result, { status: 201 })
  })
}
