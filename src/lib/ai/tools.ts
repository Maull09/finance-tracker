import { tool, type StructuredToolInterface } from "@langchain/core/tools"
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm"
import { z } from "zod"
import { budgets, transactions } from "@/db/schema"
import { accountsExist } from "@/lib/accounts"
import { healthInputSchema } from "@/lib/financial-health"
import { readFinancialHealth } from "@/lib/server/financial-health-queries"
import { healthInsightSummary } from "./financial-health"
import { getCurrentMonth, getNextMonthStart, isDate } from "@/lib/finance"
import { accountSummaryQuery, debtSummaryQuery, goalSummaryQuery } from "@/lib/server/financial-queries"
import { userDatabase } from "./server"
import { aiDraftSchema, type AiDraftInput } from "./validation"

export function financeTools(userId: string, drafts: AiDraftInput[]) {
  const overview = tool(async ({ month }) => userDatabase(userId, async (connection) => {
    const period = month ?? getCurrentMonth()
    const [balances, totals, limits, goals, debts] = await Promise.all([
      accountSummaryQuery(connection).limit(100),
      connection.select({
        type: transactions.type, category: transactions.category,
        amount: sql<number>`sum(${transactions.amount})`.mapWith(Number),
      }).from(transactions).where(and(
        gte(transactions.date, period + "-01"),
        lt(transactions.date, getNextMonthStart(period)),
      )).groupBy(transactions.type, transactions.category).limit(100),
      connection.select({ category: budgets.category, budget: budgets.budget, periodStart: budgets.periodStart })
        .from(budgets).where(eq(budgets.periodStart, period + "-01")).limit(100),
      goalSummaryQuery(connection).limit(100),
      debtSummaryQuery(connection).limit(100),
    ])
    return JSON.stringify({
      month: period, currency: "IDR", maximumRowsPerSection: 100,
      accounts: balances.map(({ id, name, type, balance }) => ({ id, name, type, balance })),
      transactionTotals: totals, budgets: limits,
      goals: goals.map(({ title, targetAmount, currentAmount, targetDate }) => ({ title, targetAmount, currentAmount, targetDate })),
      debts: debts.map(({ type, name, amount, paidAmount, remaining, dueDate }) => ({ type, name, amount, paidAmount, remaining, dueDate })),
    })
  }), {
    name: "read_financial_overview",
    description: "Read this user's account balances, monthly transaction totals by category, budget limits, goals and debts. Transfers are not income or spending. Results are capped at 100 rows per section.",
    schema: z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable() }),
  })

  const history = tool(async ({ from, to }) => userDatabase(userId, async (connection) => {
    return JSON.stringify(await connection.select({
      date: transactions.date, type: transactions.type, amount: transactions.amount,
      category: transactions.category, description: transactions.description,
      subcategory: transactions.subcategory,
      accountId: transactions.accountId, destinationAccountId: transactions.destinationAccountId,
    }).from(transactions).where(and(gte(transactions.date, from), lte(transactions.date, to)))
      .orderBy(desc(transactions.date), desc(transactions.id)).limit(50))
  }), {
    name: "read_transactions",
    description: "Read up to 50 most recent transactions in an inclusive date range. Do not present these capped results as all-time totals.",
    schema: z.object({ from: z.string().refine(isDate), to: z.string().refine(isDate) })
      .refine(({ from, to }) => from <= to),
  })

  const prepare = tool(async (data) => {
    if (drafts.length >= 3) return "At most three drafts per message. Ask the user to send another message."
    if (data.accountId !== null) {
      const valid = await userDatabase(userId, (connection) => accountsExist(
        connection, data.accountId!, data.destinationAccountId,
      ))
      if (!valid) return "Invalid account. Read the account list and ask the user which account to use."
    }
    drafts.push(data)
    return "Draft prepared for review. No transaction was saved. The user must confirm using the draft form."
  }, {
    name: "prepare_transaction_draft",
    description: "Prepare a transaction draft only when the user requests recording a transaction. Never saves a transaction. Use null for unknown amount, date or account; never invent them. Categories use the app's Indonesian category names. Do not confirm or duplicate an existing draft via chat.",
    schema: aiDraftSchema,
  })
  const health = tool(async (input) => userDatabase(userId, async (connection) =>
    JSON.stringify(healthInsightSummary(await readFinancialHealth(connection, input)))), {
    name: "read_financial_health",
    description: "Read a deterministic financial health report for a YYYY-MM month up to the current month. Use null for unknown essential monthly expenses or total monthly debt payment obligations; ask the user rather than guessing. Debt payment obligations must not be below recorded payments. Returns heuristic score, ratios, data limitations and period-end balances. Does not change records.",
    schema: healthInputSchema,
  })
  return [overview, history, health, prepare] as StructuredToolInterface[]
}
