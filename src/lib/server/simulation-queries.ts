import { stockTrades } from "@/db/schema"
import { calculateHoldings, investmentTotals } from "@/lib/investments"
import type { SimulationBalanceData } from "@/lib/planning-types"
import { debtSummaryQuery, readBalanceLedger } from "./financial-queries"
import { readLatestPrices } from "./market-queries"
import type { ReadConnection } from "./ledger"

export async function readSimulationBalance(connection: ReadConnection): Promise<SimulationBalanceData> {
  const [ledger, debts, trades] = await Promise.all([
    readBalanceLedger(connection),
    debtSummaryQuery(connection),
    connection.select().from(stockTrades),
  ])
  const prices = await readLatestPrices(connection, trades.map((trade) => trade.symbol))
  const investments = investmentTotals(calculateHoldings(trades, prices))
  const liabilities = debts.filter((debt) => debt.type === "utang")
    .reduce((total, debt) => total + debt.remaining, 0)
  const receivables = debts.filter((debt) => debt.type === "piutang")
    .reduce((total, debt) => total + debt.remaining, 0)
  const grossWorth = ledger.cashBalance + investments.costBasis + receivables
  const knownNetWorth = ledger.cashBalance + investments.knownMarketValue + receivables - liabilities
  return {
    currentBalance: ledger.cashBalance,
    grossWorth,
    knownNetWorth,
    netWorth: investments.unpricedCount ? null : knownNetWorth,
  }
}
