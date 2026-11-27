import { NextResponse } from "next/server"
import { valuedAccountBalances, valuedAccounts } from "@/db/schema"
import { parseValuedAccount } from "@/lib/valued-assets"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { readValuedAssets } from "@/lib/server/valued-assets"

export async function GET(request: Request) {
  return authenticatedResponse(async (db) => NextResponse.json(await readValuedAssets(db)), request)
}

export async function POST(request: Request) {
  return authenticatedResponse(async (db) => {
    const input = parseValuedAccount(await request.json())
    const account = await db.transaction(async (connection) => {
      const [account] = await connection.insert(valuedAccounts).values({ name: input.name, symbol: input.symbol, description: input.description }).returning()
      await connection.insert(valuedAccountBalances).values({ accountId: account.id, quantity: input.quantity, date: input.date })
      return account
    })
    return NextResponse.json(account, { status: 201 })
  })
}
