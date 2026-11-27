import { sumMoney } from "@/lib/money"
import { stockTrades } from "@/db/schema"
import { calculateHoldings, investmentTotals } from "@/lib/investments"
import type { SimulationBalanceData } from "@/lib/planning-types"
import { debtSummaryQuery, readBalanceLedger } from "./financial-queries"
import { readLatestPrices } from "./market-queries"
import type { ReadConnection } from "./ledger"
import { readValuedAssets } from "./valued-assets"

export async function readSimulationBalance(connection: ReadConnection): Promise<SimulationBalanceData> {
  const [ledger, debts, trades, valued] = await Promise.all([
    readBalanceLedger(connection),
    debtSummaryQuery(connection),
    connection.select().from(stockTrades),
    readValuedAssets(connection),
  ])
  const prices = await readLatestPrices(connection, trades.map((trade) => trade.symbol))
  const investments = investmentTotals(calculateHoldings(trades, prices))
  const liabilities = debts.filter((debt) => debt.type === "utang")
    .reduce((total, debt) => sumMoney([total, debt.remaining]), 0)
  const receivables = debts.filter((debt) => debt.type === "piutang")
    .reduce((total, debt) => sumMoney([total, debt.remaining]), 0)
  const grossWorth = sumMoney([ledger.cashBalance, investments.costBasis, receivables, valued.totals.knownValue])
  const knownNetWorth = sumMoney([ledger.cashBalance, investments.knownMarketValue, receivables, valued.totals.knownValue, -liabilities])
  return {
    currentBalance: ledger.cashBalance,
    grossWorth,
    knownNetWorth,
    netWorth: investments.unpricedCount || valued.totals.unpricedCount ? null : knownNetWorth,
  }
}
