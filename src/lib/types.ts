import type { AccountType, TransactionType } from "@/lib/finance"

export type Account = {
  id: number
  name: string
  type: AccountType
  initialBalance: number
  description: string | null
}

export type AccountSummary = Account & {
  balance: number
}

export type Transaction = {
  id: number
  type: TransactionType
  amount: number
  category: string
  subcategory: string | null
  groupName: string | null
  description: string | null
  date: string
  accountId: number
  destinationAccountId: number | null
}

export type TransactionGroupSummary = {
  groupName: string | null
  count: number
  income: number
  expense: number
}

export type Budget = {
  id: number
  category: string
  budget: number
  spent: number
  periodStart: string
  rolloverEnabled: boolean
  carryover?: number
  effectiveBudget?: number
}

export type DashboardData = {
  income: number
  expense: number
  runningBalance: number
  savingRate: number
  monthlyData: Array<{ month: string; income: number; expense: number; balance: number }>
  balanceHistory: Array<{ month: string; balance: number }>
  dailyData: Array<{
    date: string
    label: string
    income: number
    expense: number
  }>
  today: { income: number; expense: number; net: number }
  dailyAverageExpense: number
  highestExpenseDay: { label: string; amount: number } | null
  topExpenseCategory: { name: string; amount: number } | null
  spendingChange: { amount: number; percent: number } | null
  expenseByCategory: Record<string, number>
  incomeBySource: Record<string, number>
  insights: string[]
}
