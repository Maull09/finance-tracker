import { sumMoney } from "@/lib/money"
import { and, asc, eq, getTableColumns, gte, lt, sql } from "drizzle-orm"
import { budgets, transactions } from "@/db/schema"
import { calculateBudgetCarryover } from "@/lib/calculations"
import type { UserDatabase } from "./authenticated-response"

export async function readBudgets(
  connection: Pick<UserDatabase, "select" | "selectDistinctOn">,
  periodStart: string,
  periodEnd: string,
  previousStart: string,
) {
  const expenses = connection
    .select({
      category: transactions.category,
      spent: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.date} >= ${periodStart}), 0)`.as("expense_total"),
      previousSpent: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.date} < ${periodStart}), 0)`.as("previous_spent"),
    })
    .from(transactions)
    .where(and(
      eq(transactions.type, "expense"),
      gte(transactions.date, previousStart),
      lt(transactions.date, periodEnd),
    ))
    .groupBy(transactions.category)
    .as("expenses")
  const previous = connection
    .selectDistinctOn([budgets.category], {
      category: budgets.category,
      budget: budgets.budget,
      rolloverEnabled: budgets.rolloverEnabled,
    })
    .from(budgets)
    .where(eq(budgets.periodStart, previousStart))
    .orderBy(asc(budgets.category), asc(budgets.id))
    .as("previous_budgets")
  const rows = await connection
    .select({
      ...getTableColumns(budgets),
      spent: sql<number>`coalesce(${expenses.spent}, 0)`.mapWith(Number),
      previousSpent: sql<number>`coalesce(${expenses.previousSpent}, 0)`.mapWith(Number),
      previousBudget: previous.budget,
      previousRollover: previous.rolloverEnabled,
    })
    .from(budgets)
    .leftJoin(expenses, eq(expenses.category, budgets.category))
    .leftJoin(previous, eq(previous.category, budgets.category))
    .where(eq(budgets.periodStart, periodStart))
    .orderBy(asc(budgets.category))
  return rows.map(({ previousSpent, previousBudget, previousRollover, ...budget }) => {
    const carryover = calculateBudgetCarryover(
      previousBudget ?? 0, previousSpent, previousRollover ?? false,
    )
    return { ...budget, carryover, effectiveBudget: sumMoney([budget.budget, carryover]) }
  })
}
