import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { accounts, sinkingFunds } from "@/db/schema"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { FinanceError } from "@/lib/finance-errors"
import { parseFund } from "@/lib/planning-validation"
import { fundBalance, monthlyFundSaving } from "@/lib/planning"
import { getToday } from "@/lib/finance"
import { readReservations } from "@/lib/server/ledger"
import { readBalanceLedger } from "@/lib/server/financial-queries"
import { sumMoney } from "@/lib/money"

export async function GET(request: Request) {
  return authenticatedResponse(async (db) => {
    const [ledger, reservations] = await Promise.all([
      readBalanceLedger(db),
      readReservations(db),
    ])
    const entriesByFund = new Map<number, typeof reservations.entries>()
    for (const entry of reservations.entries) {
      const entries = entriesByFund.get(entry.fundId) ?? []
      entries.push(entry)
      entriesByFund.set(entry.fundId, entries)
    }
    return NextResponse.json({
      funds: reservations.funds.map((fund) => {
        const entries = (entriesByFund.get(fund.id) ?? [])
          .sort((a, b) => b.id - a.id)
        const allocated = fundBalance(entries)
        return {
          ...fund,
          allocated,
          monthlySaving: monthlyFundSaving(
            fund.targetAmount,
            allocated,
            fund.targetDate,
            getToday(),
          ),
          entries,
        }
      }),
      accounts: ledger.summaries.map((account) => ({
        ...account,
        availableCash:
          sumMoney([account.balance, -(reservations.reserved.get(account.id) ?? 0)]),
      })),
    })
  }, request)
}

export async function POST(request: NextRequest) {
  return authenticatedResponse(async (db) => {
    const input = parseFund(await request.json())
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
    if (!account) throw new FinanceError("recordMissing", 404)
    const [fund] = await db.insert(sinkingFunds).values(input).returning()
    return NextResponse.json(fund, { status: 201 })
  })
}
