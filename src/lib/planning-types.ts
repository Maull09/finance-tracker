import type { Account } from "./types"
import type { Holding, StockTrade, StockPrice } from "./investments"

export type CashAccount = Account & { balance: number; availableCash: number }
export type PortfolioData = {
  holdings: Array<Holding & { name: string; accountName: string }>
  totals: {
    costBasis: number
    knownMarketValue: number
    marketValue: number | null
    unrealizedGain: number | null
    realizedGain: number
    unpricedCount: number
  }
  accounts: CashAccount[]
  trades: Array<StockTrade & { note: string }>
  watchlist: Array<{
    symbol: string
    name: string
    note: string
    quote: StockPrice | null
  }>
}

export type FundEntry = {
  id: number
  fundId: number
  kind: string
  amount: number
  date: string
  note: string
  transactionId: number | null
}
export type SinkingFund = {
  id: number
  name: string
  accountId: number
  targetAmount: number
  targetDate: string
  description: string
  allocated: number
  monthlySaving: number
  entries: FundEntry[]
}
export type FundsData = { funds: SinkingFund[]; accounts: CashAccount[] }
export type CalendarEvent = {
  id: string
  name: string
  type: string
  amount: number
  date: string
  source: string
}
export type CalendarData = { month: string; events: CalendarEvent[] }
export type PlannedCashflow = {
  name: string
  amount: number
  date: string
}
export type SimulationBalanceData = {
  currentBalance: number
  grossWorth: number
  knownNetWorth: number
  netWorth: number | null
}
export type SimulationData = SimulationBalanceData & {
  endDate: string
  projectedGrossWorth: number
  knownProjectedNetWorth: number
  projectedNetWorth: number | null
  baseline: number
  scenario: number
  difference: number
  scheduledIncome: number
  scheduledExpense: number
  extraIncome: number
  extraIncomeCount: number
  extraExpense: number
  extraExpenseCount: number
  rows: Array<{
    month: string
    income: number
    expense: number
    extraIncome: number
    extraExpense: number
    baseline: number
    scenario: number
    difference: number
    knownNetWorth: number
    netWorth: number | null
    grossWorth: number
  }>
}
export type NetWorthData = {
  cash: number
  investments: PortfolioData["totals"]
  liabilities: number
  receivables: number
  reservedCash: number
  availableCash: number
  knownNetWorth: number
  netWorth: number | null
  accounts: Array<Account & { balance: number }>
  holdings: Holding[]
  debts: Array<{ id: number; name: string; type: string; remaining: number }>
}
