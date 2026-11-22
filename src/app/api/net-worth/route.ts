import { NextResponse } from "next/server"
import { stockTrades } from "@/db/schema"
import { calculateHoldings, investmentTotals } from "@/lib/investments"
import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { readBalanceLedger, readReservedCash, debtSummaryQuery } from "@/lib/server/financial-queries"
import { readLatestPrices } from "@/lib/server/market-queries"
import { sumMoney } from "@/lib/money"

export async function GET(request: Request) {
  return authenticatedResponse(async (db) => {
    const [ledger, reservations, debtRows, trades] =
      await Promise.all([
        readBalanceLedger(db),
        readReservedCash(db),
        debtSummaryQuery(db),
        db.select().from(stockTrades),
      ])
    const prices = await readLatestPrices(db, trades.map((trade) => trade.symbol))
    const holdings = calculateHoldings(trades, prices)
    const investments = investmentTotals(holdings)
    const balances = debtRows.map((row) => {
      const debt: Omit<typeof row, "paidAmount"> & { paidAmount?: number } = { ...row }
      delete debt.paidAmount
      return debt
    })
    const liabilities = balances
      .filter((debt) => debt.type === "utang")
      .reduce((total, debt) => sumMoney([total, debt.remaining]), 0)
    const receivables = balances
      .filter((debt) => debt.type === "piutang")
      .reduce((total, debt) => sumMoney([total, debt.remaining]), 0)
    const reservedCash = [...reservations.reserved.values()].reduce(
      (total, amount) => sumMoney([total, amount]),
      0,
    )
    const knownNetWorth =
      sumMoney([ledger.cashBalance, investments.knownMarketValue, receivables, -liabilities])
    return NextResponse.json({
      cash: ledger.cashBalance,
      investments,
      liabilities,
      receivables,
      reservedCash,
      availableCash: sumMoney([ledger.cashBalance, -reservedCash]),
      knownNetWorth,
      netWorth: investments.unpricedCount ? null : knownNetWorth,
      accounts: ledger.summaries,
      holdings,
      debts: balances,
    })
  }, request)
}
