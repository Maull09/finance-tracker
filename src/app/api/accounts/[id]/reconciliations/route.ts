import { and, desc, eq, lte, or } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"

import {
  accounts,
  reconciliations,
  transactions,
  stockTrades,
} from "@/db/schema"
import { calculateAccountBalance } from "@/lib/calculations"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { getToday, isDate } from "@/lib/finance"
import { tradeCashChange } from "@/lib/investments"
import { parseMoneyInput } from "@/lib/money-input"
import { integerInput, recordInput } from "@/lib/planning-validation"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const accountId = integerInput((await params).id, 1, 2_147_483_647)
    const data = await db
      .select()
      .from(reconciliations)
      .where(eq(reconciliations.accountId, accountId))
      .orderBy(desc(reconciliations.date))
    return NextResponse.json(data)
  }, request)
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  return authenticatedResponse(async (db) => {
    const accountId = integerInput((await params).id, 1, 2_147_483_647)
    const body = recordInput(await request.json())
    const actualBalance = parseMoneyInput(
      body.actualBalance,
      -2_147_483_648,
      2_147_483_647,
    )
    const date = typeof body.date === "string" ? body.date : getToday()

    if (actualBalance === null || !isDate(date))
      return NextResponse.json({ code: "invalidInput" }, { status: 400 })

    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
    if (!account)
      return NextResponse.json({ code: "recordMissing" }, { status: 404 })
    const [accountTransactions, trades] = await Promise.all([
      db.select().from(transactions).where(and(
        lte(transactions.date, date),
        or(eq(transactions.accountId, accountId), eq(transactions.destinationAccountId, accountId)),
      )),
      db.select().from(stockTrades).where(and(eq(stockTrades.accountId, accountId), lte(stockTrades.date, date))),
    ])
    const recordedCents =
      Math.round(
        calculateAccountBalance(account.initialBalance, accountId, accountTransactions) * 100,
      ) +
      trades.reduce(
        (total, trade) => total + Math.round(tradeCashChange(trade) * 100),
        0,
      )
    const [reconciliation] = await db
      .insert(reconciliations)
      .values({
        accountId,
        actualBalance,
        date,
        note: typeof body.note === "string" ? body.note.trim() : "",
      })
      .returning()

    return NextResponse.json(
      {
        ...reconciliation,
        recordedBalance: recordedCents / 100,
        difference: (Math.round(actualBalance * 100) - recordedCents) / 100,
      },
      { status: 201 },
    )
  })
}
