import { getToday, isDate } from "./finance"
import { FinanceError } from "./finance-errors"
import { tradeCashChange } from "./investments"
import { parseTransactionInput } from "./validation"

export function recordInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new FinanceError("invalidInput")
  return value as Record<string, unknown>
}

export function integerInput(
  value: unknown,
  minimum = 1,
  maximum = 1_000_000_000_000,
) {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || !/^\d+$/.test(value))
  )
    throw new FinanceError("invalidInput")
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum)
    throw new FinanceError("invalidInput")
  return number
}

export function textInput(value: unknown, maximum = 120, required = true) {
  if (value != null && typeof value !== "string")
    throw new FinanceError("invalidInput")
  const text = typeof value === "string" ? value.trim() : ""
  if ((required && !text) || text.length > maximum)
    throw new FinanceError("invalidInput")
  return text
}

export function decimalInput(
  value: unknown,
  places: number,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" && typeof value !== "string")
    throw new FinanceError("invalidInput")
  const text = String(value)
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new FinanceError("invalidInput")
  const fraction = (text.split(".")[1] ?? "").replace(/0+$/, "")
  const number = Number(text)
  if (
    fraction.length > places ||
    !Number.isFinite(number) ||
    number < minimum ||
    number > maximum
  )
    throw new FinanceError("invalidInput")
  return number
}

export function symbolInput(value: unknown) {
  const symbol = textInput(value, 4).toUpperCase()
  if (!/^[A-Z]{4}$/.test(symbol)) throw new FinanceError("invalidInput")
  return symbol
}

export function parseStockTrade(value: unknown) {
  const body = recordInput(value)
  if (body.side !== "buy" && body.side !== "sell")
    throw new FinanceError("invalidInput")
  if (!isDate(body.date) || body.date > getToday() || body.date < "1900-01-01")
    throw new FinanceError("invalidInput")
  const lots = decimalInput(body.lots, 6, 0.000001, 100_000)
  const shares = Math.round(lots * 1_000_000) / 10_000
  const price = decimalInput(body.price, 4, 0.0001, 1_000_000_000)
  const fees = integerInput(body.fees ?? 0, 0, 2_147_483_647)
  const gross = -tradeCashChange({ side: "buy", shares, price, fees: 0 })
  if (
    gross <= 0 ||
    gross + fees > 1_000_000_000_000 ||
    (body.side === "sell" && fees >= gross)
  )
    throw new FinanceError("invalidInput")
  return {
    symbol: symbolInput(body.symbol),
    accountId: integerInput(body.accountId, 1, 2_147_483_647),
    side: body.side,
    shares,
    price,
    fees,
    date: body.date,
    note: textInput(body.note, 500, false),
  }
}

export function parseFund(value: unknown) {
  const body = recordInput(value)
  if (!isDate(body.targetDate) || body.targetDate < getToday())
    throw new FinanceError("invalidInput")
  return {
    name: textInput(body.name),
    accountId: integerInput(body.accountId, 1, 2_147_483_647),
    targetAmount: integerInput(body.targetAmount, 1, 2_147_483_647),
    targetDate: body.targetDate,
    description: textInput(body.description, 500, false),
  }
}

export function parseGoal(value: unknown) {
  const body = recordInput(value)
  if (!isDate(body.targetDate) || "currentAmount" in body)
    throw new FinanceError("invalidInput")
  return {
    title: textInput(body.title),
    description: textInput(body.description, 500, false),
    targetAmount: integerInput(body.targetAmount, 1, 2_147_483_647),
    targetDate: body.targetDate,
    category: textInput(body.category ?? "other"),
  }
}

export function parseDebt(value: unknown) {
  const body = recordInput(value)
  if (
    (body.type !== "utang" && body.type !== "piutang") ||
    "status" in body ||
    "paidDate" in body ||
    "paidAmount" in body ||
    (body.dueDate != null && body.dueDate !== "" && !isDate(body.dueDate))
  )
    throw new FinanceError("invalidInput")
  return {
    type: body.type as "utang" | "piutang",
    name: textInput(body.name),
    amount: integerInput(body.amount, 1, 2_147_483_647),
    description: textInput(body.description, 500, false),
    dueDate: body.dueDate ? String(body.dueDate) : null,
  }
}

export function parseRecurring(value: unknown) {
  const body = recordInput(value)
  const transaction = parseTransactionInput({ ...body, description: textInput(body.description, 500, false), date: body.startDate })
  if (
    !transaction ||
    (body.frequency !== "weekly" && body.frequency !== "monthly") ||
    (body.endDate != null && body.endDate !== "" &&
      (!isDate(body.endDate) || String(body.endDate) < transaction.date))
  )
    throw new FinanceError("invalidInput")
  const { date, ...input } = transaction
  return {
    ...input,
    name: textInput(body.name),
    frequency: body.frequency as "weekly" | "monthly",
    startDate: date,
    endDate: body.endDate ? String(body.endDate) : null,
  }
}

export function parseOccurrenceRecording(value: unknown) {
  const body = recordInput(value)
  if (!isDate(body.scheduledDate) || body.scheduledDate < "1900-01-01" || body.scheduledDate > "2100-12-31" ||
      !isDate(body.date) || body.date < "1900-01-01" || body.date > getToday())
    throw new FinanceError("invalidInput")
  return { scheduledDate: body.scheduledDate, date: body.date }
}

export function parseSimulation(value: unknown) {
  const body = recordInput(value)
  const today = getToday()
  const endDate = body.endDate
  if (
    !isDate(endDate) ||
    endDate < today ||
    Date.parse(endDate) - Date.parse(today) > 730 * 86400000
  )
    throw new FinanceError("invalidInput")
  const projectionEndDate = endDate
  if (!Array.isArray(body.extraIncomes) || !Array.isArray(body.extraExpenses))
    throw new FinanceError("invalidInput")
  if (body.extraIncomes.length + body.extraExpenses.length > 20)
    throw new FinanceError("invalidInput")
  function parsePlannedCashflows(value: unknown[]) {
    return value.map((cashflow) => {
      const input = recordInput(cashflow)
      if (
        !isDate(input.date) ||
        input.date < today ||
        input.date > projectionEndDate
      )
        throw new FinanceError("invalidInput")
      return {
        name: textInput(input.name),
        amount: integerInput(input.amount, 1, 2_147_483_647),
        date: input.date,
      }
    })
  }
  return {
    endDate: projectionEndDate,
    extraIncomes: parsePlannedCashflows(body.extraIncomes),
    extraExpenses: parsePlannedCashflows(body.extraExpenses),
  }
}
