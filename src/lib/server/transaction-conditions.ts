import { and, eq, gte, ilike, inArray, isNull, lte, or } from "drizzle-orm"
import { transactions } from "@/db/schema"
import { findEnglishCategoryMatches, parseTransactionFilters } from "@/lib/transaction-filters"

export function transactionConditions(filters: NonNullable<ReturnType<typeof parseTransactionFilters>>) {
  const conditions = []
  if (filters.category) conditions.push(eq(transactions.category, filters.category))
  if (filters.subcategory) conditions.push(eq(transactions.subcategory, filters.subcategory))
  if (filters.type !== "all") conditions.push(eq(transactions.type, filters.type))
  if (filters.accountId) conditions.push(or(eq(transactions.accountId, filters.accountId), eq(transactions.destinationAccountId, filters.accountId)))
  if (filters.from) conditions.push(gte(transactions.date, filters.from))
  if (filters.to) conditions.push(lte(transactions.date, filters.to))
  if (filters.groupName) conditions.push(eq(transactions.groupName, filters.groupName))
  if (filters.ungrouped) conditions.push(isNull(transactions.groupName))
  if (filters.search) {
    const search = "%" + filters.search.replace(/[\\%_]/g, "\\$&") + "%"
    const categories = findEnglishCategoryMatches(filters.search)
    conditions.push(or(ilike(transactions.category, search), ilike(transactions.subcategory, search), ilike(transactions.description, search),
      ilike(transactions.groupName, search), categories.length ? or(inArray(transactions.category, categories), inArray(transactions.subcategory, categories)) : undefined))
  }
  return and(...conditions)
}
