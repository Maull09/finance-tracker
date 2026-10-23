import { z } from "zod"
import { getToday, isDate, isMonth } from "@/lib/finance"
import { healthInputSchema } from "@/lib/financial-health"
import { parseTransactionFilters } from "@/lib/transaction-filters"

export const insightPages = ["dashboard", "transactions", "investments", "budget", "goals", "debts",
  "reports", "financialHealth", "planning", "netWorth", "calendar", "simulation", "funds"] as const
export type InsightPage = typeof insightPages[number]
const month = z.string().refine((value) => isMonth(value) && value >= "1900-01" && value <= "2100-12")
const cashflow = z.object({ amount: z.number().int().positive().max(2_147_483_647), date: z.string().refine(isDate) }).strict()
const simulation = z.object({
  endDate: z.string().refine((date) => isDate(date) && date >= getToday() && Date.parse(date) - Date.parse(getToday()) <= 730 * 86400000),
  extraIncomes: z.array(cashflow).max(20), extraExpenses: z.array(cashflow).max(20),
}).strict().refine((input) => input.extraIncomes.length + input.extraExpenses.length <= 20 &&
  [...input.extraIncomes, ...input.extraExpenses].every((item) => item.date >= getToday() && item.date <= input.endDate))

export const insightContextSchema = z.discriminatedUnion("page", [
  z.object({ page: z.literal(["dashboard", "investments", "goals", "debts", "netWorth", "funds"]), }).strict(),
  z.object({ page: z.literal(["budget", "reports", "calendar"]), month }).strict(),
  z.object({ page: z.literal("transactions"), filters: z.string().max(2000).refine((value) => {
    const params = new URLSearchParams(value)
    return [...params.keys()].every((key) => ["search", "type", "category", "subcategory", "account", "group", "ungrouped", "from", "to"].includes(key)) && Boolean(parseTransactionFilters(params))
  }) }).strict(),
  z.object({ page: z.literal("financialHealth"), input: healthInputSchema }).strict(),
  z.object({ page: z.literal("planning"), endDate: z.string().refine((value) => isDate(value) && value >= getToday() && Date.parse(value) - Date.parse(getToday()) <= 730 * 86400000) }).strict(),
  z.object({ page: z.literal("simulation"), input: simulation }).strict(),
])
export type InsightContext = z.infer<typeof insightContextSchema>
export const insightRequestSchema = z.object({ context: insightContextSchema, locale: z.enum(["id", "en"]), refresh: z.boolean().default(false) }).strict()
export type InsightRequest = z.infer<typeof insightRequestSchema>
export type InsightResult = { text: string; generatedAt: string; conversationId: string }
export type InsightStatus = { jobId: string; status: "waiting" | "active" | "completed" | "failed" | "stale"; result?: InsightResult }

export function canonicalInsightContext(context: InsightContext) {
  if (context.page !== "transactions") return context
  const filters = parseTransactionFilters(new URLSearchParams(context.filters))!
  const params = new URLSearchParams()
  if (filters.search) params.set("search", filters.search)
  if (filters.category) params.set("category", filters.category)
  if (filters.subcategory) params.set("subcategory", filters.subcategory)
  if (filters.type !== "all") params.set("type", filters.type)
  if (filters.accountId) params.set("account", String(filters.accountId))
  if (filters.groupName) params.set("group", filters.groupName)
  if (filters.ungrouped) params.set("ungrouped", "true")
  if (filters.from) params.set("from", filters.from)
  if (filters.to) params.set("to", filters.to)
  params.sort()
  return { ...context, filters: params.toString() }
}
