import {
  accountTypes,
  isDate,
  isMonth,
  transactionTypes,
  type AccountType,
  type TransactionType,
} from "./finance"
import { isValidSubcategory } from "./categories"

type RecordBody = Record<string, unknown>

export type TransactionInput = {
  type: TransactionType
  amount: number
  category: string
  subcategory: string | null
  groupName: string | null
  description: string
  date: string
  accountId: number
  destinationAccountId: number | null
}

export type AccountInput = {
  name: string
  type: AccountType
  initialBalance: number
  description: string
}

export type BudgetInput = {
  category: string
  budget: number
  periodStart: string
  rolloverEnabled: boolean
}

export function parseTransactionInput(value: unknown): TransactionInput | null {
  if (!isRecord(value)) return null

  const type = value.type
  const amount = toPositiveInteger(value.amount)
  const category = toRequiredText(value.category)
  const subcategory = value.subcategory == null || value.subcategory === "" ? null : toRequiredText(value.subcategory)
  const groupName = parseTransactionGroupName(value.groupName)
  const date = value.date
  const accountId = toPositiveInteger(value.accountId)
  const destinationAccountId = value.destinationAccountId == null ? null : toPositiveInteger(value.destinationAccountId)

  if (
    !transactionTypes.includes(type as TransactionType) ||
    amount == null ||
    !category ||
    subcategory === "" ||
    !isValidSubcategory(type as TransactionType, category, subcategory) ||
    groupName === undefined ||
    !isDate(date) ||
    accountId == null
  ) {
    return null
  }

  if (type === "transfer" && (destinationAccountId == null || destinationAccountId === accountId)) {
    return null
  }

  return {
    type: type as TransactionType,
    amount,
    category,
    subcategory,
    groupName,
    description: toOptionalText(value.description),
    date: date as string,
    accountId,
    destinationAccountId: type === "transfer" ? destinationAccountId : null,
  }
}

export function parseTransactionGroupName(
  value: unknown,
): string | null | undefined {
  if (value == null) return null
  if (typeof value !== "string" || value.trim().length > 100) return undefined
  return value.trim() || null
}

export function parseAccountInput(value: unknown): AccountInput | null {
  if (!isRecord(value)) return null

  const name = toRequiredText(value.name)
  const type = value.type
  const initialBalance = value.initialBalance == null || value.initialBalance === "" ? 0 : toInteger(value.initialBalance)

  if (!name || !accountTypes.includes(type as AccountType) || initialBalance == null) {
    return null
  }

  return { name, type: type as AccountType, initialBalance, description: toOptionalText(value.description) }
}

export function parseBudgetInput(value: unknown): BudgetInput | null {
  if (!isRecord(value)) return null

  const category = toRequiredText(value.category)
  const budget = toPositiveInteger(value.budget)
  const periodStart = value.periodStart

  if (!category || budget == null || !isMonth(periodStart)) {
    return null
  }

  return { category, budget, periodStart: `${periodStart}-01`, rolloverEnabled: value.rolloverEnabled === true }
}

function isRecord(value: unknown): value is RecordBody {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function toRequiredText(value: unknown) {
  return typeof value === "string" && value.trim().length <= 120 ? value.trim() : ""
}

function toOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function toPositiveInteger(value: unknown) {
  const parsed = toInteger(value)
  return parsed != null && parsed > 0 ? parsed : null
}

function toInteger(value: unknown) {
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN
  return Number.isSafeInteger(parsed) && parsed >= -2_147_483_648 && parsed <= 2_147_483_647 ? parsed : null
}
