import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { valuedAccountBalances, valuedAccounts } from "@/db/schema"
import { parseValuedAccount } from "@/lib/valued-assets"
import { integerInput } from "@/lib/planning-validation"
import { FinanceError } from "@/lib/finance-errors"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { readValuedAccountHistory } from "@/lib/server/valued-assets"

type Context = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Context) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const [account] = await db.select().from(valuedAccounts).where(eq(valuedAccounts.id, id))
    if (!account) throw new FinanceError("recordMissing", 404)
    return NextResponse.json(await readValuedAccountHistory(db, id))
  }, request)
}

export async function PATCH(request: Request, { params }: Context) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const input = parseValuedAccount(await request.json())
    const account = await db.transaction(async (connection) => {
      const [current] = await connection.select().from(valuedAccounts).where(eq(valuedAccounts.id, id)).for("update")
      if (!current) throw new FinanceError("recordMissing", 404)
      if (input.symbol !== current.symbol) throw new FinanceError("historyProtected", 409)
      const [updated] = await connection.update(valuedAccounts).set({ name: input.name, description: input.description }).where(eq(valuedAccounts.id, id)).returning()
      await connection.insert(valuedAccountBalances).values({ accountId: id, quantity: input.quantity, date: input.date })
      return updated
    })
    return NextResponse.json(account)
  })
}

export async function DELETE(request: Request, { params }: Context) {
  return authenticatedResponse(async (db) => {
    const id = integerInput((await params).id, 1, 2_147_483_647)
    const [deleted] = await db.delete(valuedAccounts).where(eq(valuedAccounts.id, id)).returning({ id: valuedAccounts.id })
    if (!deleted) throw new FinanceError("recordMissing", 404)
    return NextResponse.json(deleted)
  })
}
