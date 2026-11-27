import { sumMoney } from "@/lib/money"
import { NextRequest, NextResponse } from "next/server"
import { debtPayments, debts } from "@/db/schema"
import { eq } from "drizzle-orm"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { integerInput, parseDebt } from "@/lib/planning-validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const input = parseDebt(await req.json())
    const result = await db.transaction(async (connection) => {
      const [debt] = await connection
        .select()
        .from(debts)
        .where(eq(debts.id, id))
        .for("update")
      if (!debt) throw new FinanceError("recordMissing", 404)
      const payments = await connection
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.debtId, id))
      const paid = payments.reduce(
        (total, payment) => sumMoney([total, payment.amount]),
        0,
      )
      if (
        !payments.length &&
        debt.status === "paid" &&
        (input.type !== debt.type || input.amount !== debt.amount)
      )
        throw new FinanceError("historyProtected", 409)
      if (input.amount < paid)
        throw new FinanceError("amountBelowRecorded", 409)
      if (payments.length && input.type !== debt.type)
        throw new FinanceError("historyProtected", 409)
      const isPaid = paid === input.amount
      const lastPayment =
        payments
          .map((payment) => payment.date)
          .sort()
          .at(-1) ?? null
      const [updated] = await connection
        .update(debts)
        .set({
          ...input,
          status: payments.length ? (isPaid ? "paid" : "unpaid") : debt.status,
          paidDate: payments.length
            ? isPaid
              ? lastPayment
              : null
            : debt.paidDate,
        })
        .where(eq(debts.id, id))
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
      const [debt] = await connection
        .select()
        .from(debts)
        .where(eq(debts.id, id))
        .for("update")
      if (!debt) throw new FinanceError("recordMissing", 404)
      const [history] = await connection
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.debtId, id))
        .limit(1)
      if (history) throw new FinanceError("historyProtected", 409)
      await connection.delete(debts).where(eq(debts.id, id))
    })
    return NextResponse.json({ id })
  })
}
