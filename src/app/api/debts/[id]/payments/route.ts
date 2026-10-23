import { asc, eq, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

import { accounts, debtPayments, debts, transactions } from "@/db/schema"
import { getToday, isDate } from "@/lib/finance"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { integerInput, recordInput, textInput } from "@/lib/planning-validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const debtId = integerInput((await params).id, 1, 2_147_483_647)
    const [debt] = await db.select().from(debts).where(eq(debts.id, debtId))
    if (!debt) throw new FinanceError("recordMissing", 404)
    return NextResponse.json(
      await db
        .select()
        .from(debtPayments)
        .where(eq(debtPayments.debtId, debtId))
        .orderBy(asc(debtPayments.date), asc(debtPayments.id)),
    )
  }, request)
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const debtId = integerInput((await params).id, 1, 2_147_483_647)
    const body = recordInput(await request.json())
    const amount = integerInput(body.amount, 1, 2_147_483_647)
    const accountId = integerInput(body.accountId, 1, 2_147_483_647)
    const date = body.date ?? getToday()
    if (!isDate(date) || date > getToday())
      throw new FinanceError("invalidInput")
    const note = textInput(body.note, 500, false)
    const result = await db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for("update")
      if (!account) throw new FinanceError("recordMissing", 404)
      const [debt] = await tx
        .select()
        .from(debts)
        .where(eq(debts.id, debtId))
        .for("update")
      if (!debt) throw new FinanceError("recordMissing", 404)
      if (debt.status === "paid")
        throw new FinanceError("debtPaymentExceeded", 409)
      const [payments] = await tx
        .select({ amount: sql<number>`coalesce(sum(${debtPayments.amount}), 0)`.mapWith(Number) })
        .from(debtPayments)
        .where(eq(debtPayments.debtId, debtId))
      const paidAmount = payments.amount
      if (paidAmount + amount > debt.amount)
        throw new FinanceError("debtPaymentExceeded", 409)
      const [transaction] = await tx
        .insert(transactions)
        .values({
          type: debt.type === "utang" ? "expense" : "income",
          amount,
          category: debt.type === "utang" ? "Utang" : "Piutang",
          subcategory:
            debt.type === "utang" ? "Pembayaran utang" : "Penerimaan piutang",
          description: note || debt.name,
          date,
          accountId,
          destinationAccountId: null,
        })
        .returning()
      const [payment] = await tx
        .insert(debtPayments)
        .values({
          debtId,
          accountId,
          amount,
          date,
          note,
          transactionId: transaction.id,
        })
        .returning()
      const isPaid = paidAmount + amount === debt.amount
      await tx
        .update(debts)
        .set({
          status: isPaid ? "paid" : "unpaid",
          paidDate: isPaid ? date : null,
        })
        .where(eq(debts.id, debtId))
      return payment
    })
    return NextResponse.json(result, { status: 201 })
  })
}
