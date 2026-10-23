import { isDate, transactionTypes, type TransactionType } from "./finance"
import { expenseCategories, incomeCategories } from "./finance"
import { getSubcategories } from "./categories"
import { messages } from "./i18n"
import { parseTransactionGroupName } from "./validation"

export function findEnglishCategoryMatches(search: string) {
  const query = search.trim().toLowerCase()
  if (!query) return []
  const categories = [
    ...new Set([
      ...incomeCategories,
      ...expenseCategories,
      "Transfer antar akun",
      ...[...incomeCategories, ...expenseCategories].flatMap((category) => getSubcategories("all", category)),
    ]),
  ]
  return categories.filter((category) =>
    messages.en[category]?.toLowerCase().includes(query),
  )
}

export function parseTransactionFilters(params: URLSearchParams) {
  const type = params.get("type") ?? "all"
  const account = params.get("account") ?? "all"
  const from = params.get("from") ?? ""
  const to = params.get("to") ?? ""
  const groupName = parseTransactionGroupName(params.get("group"))
  const ungrouped = params.get("ungrouped") ?? "false"
  const category = params.get("category")?.trim() || ""
  const subcategory = params.get("subcategory")?.trim() || ""
  if (category.length > 120 || subcategory.length > 120 || (subcategory && !category)) return null
  if (
    groupName === undefined ||
    !["true", "false"].includes(ungrouped) ||
    (groupName && ungrouped === "true")
  )
    return null
  if (type !== "all" && !transactionTypes.includes(type as TransactionType))
    return null
  if (
    account !== "all" &&
    (!Number.isSafeInteger(Number(account)) || Number(account) < 1)
  )
    return null
  if (
    (from && !isDate(from)) ||
    (to && !isDate(to)) ||
    (from && to && from > to)
  )
    return null
  return {
    search: (params.get("search") ?? "").trim().slice(0, 200),
    category,
    subcategory,
    type: type as "all" | TransactionType,
    accountId: account === "all" ? null : Number(account),
    from,
    to,
    groupName,
    ungrouped: ungrouped === "true",
  }
}
