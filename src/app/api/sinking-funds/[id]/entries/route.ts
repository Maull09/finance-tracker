import { eq, sql } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import {
  accounts,
  sinkingFunds,
  sinkingFundEntries,
  transactions,
} from "@/db/schema"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { integerInput, recordInput, textInput } from "@/lib/planning-validation"
import { expenseCategories, getToday } from "@/lib/finance"
import { isValidSubcategory } from "@/lib/categories"
import { accountSummaryQuery, readReservedCash } from "@/lib/server/financial-queries"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return authenticatedResponse(async (db) => {
    const fundId = integerInput((await params).id, 1, 2_147_483_647)
    const body = recordInput(await request.json())
    const amount = integerInput(body.amount, 1, 2_147_483_647)
    const kind = body.kind
    if (!["allocate", "release", "spend"].includes(String(kind)))
      throw new FinanceError("invalidInput")
    const note = textInput(body.note, 500, false)
    const category = textInput(body.category ?? "Lainnya")
    const subcategory = body.subcategory == null || body.subcategory === "" ? null : textInput(body.subcategory)
    if (
      kind === "spend" &&
      (!isValidSubcategory("expense", category, subcategory) ||
        !expenseCategories.includes(category))
    )
      throw new FinanceError("invalidInput")
    const entry = await db.transaction(async (connection) => {
      const [fund] = await connection
        .select()
        .from(sinkingFunds)
        .where(eq(sinkingFunds.id, fundId))
        .for("update")
      if (!fund) throw new FinanceError("recordMissing", 404)
      await connection
        .select()
        .from(accounts)
        .where(eq(accounts.id, fund.accountId))
        .for("update")
      const [summaries, reservations, allocations] = await Promise.all([
        accountSummaryQuery(connection, [fund.accountId]),
        readReservedCash(connection, [fund.accountId]),
        connection
          .select({
            amount: sql<number>`coalesce(sum(case when ${sinkingFundEntries.kind} = 'allocate' then ${sinkingFundEntries.amount} else -${sinkingFundEntries.amount} end), 0)`.mapWith(Number),
          })
          .from(sinkingFundEntries)
          .where(eq(sinkingFundEntries.fundId, fund.id)),
      ])
      const allocated = allocations[0].amount
      const cash = summaries[0].balance
      const availableCash =
        cash - (reservations.reserved.get(fund.accountId) ?? 0)
      if (kind === "allocate" && amount > availableCash)
        throw new FinanceError("insufficientAvailableCash", 409)
      if (kind === "allocate" && allocated + amount > fund.targetAmount)
        throw new FinanceError("fundTargetExceeded", 409)
      if (kind !== "allocate" && amount > allocated)
        throw new FinanceError("fundBalanceExceeded", 409)
      if (kind === "spend" && cash < amount)
        throw new FinanceError("insufficientCash", 409)
      let transactionId: number | null = null
      if (kind === "spend") {
        const [transaction] = await connection
          .insert(transactions)
          .values({
            type: "expense",
            accountId: fund.accountId,
            amount,
            category,
            subcategory,
            date: getToday(),
            description: fund.name + (note ? ": " + note : ""),
          })
          .returning()
        transactionId = transaction.id
      }
      const [entry] = await connection
        .insert(sinkingFundEntries)
        .values({
          fundId,
          kind: String(kind),
          amount,
          date: getToday(),
          note,
          transactionId,
        })
        .returning()
      return entry
    })
    return NextResponse.json(entry, { status: 201 })
  })
}
