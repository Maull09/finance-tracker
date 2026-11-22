import { asc, eq, inArray } from "drizzle-orm"
import type { UserDatabase } from "@/lib/server/authenticated-response"
import { accounts, stockInstruments, stockTrades } from "@/db/schema"
import { tradeCashChange, validateInvestmentAccount } from "../investments"
import { FinanceError } from "../finance-errors"
import { parseStockTrade } from "../planning-validation"
import { readLedger } from "./ledger"
import { readReservedCash } from "./financial-queries"

export async function recordStockTrade(db: UserDatabase, body: unknown) {
  const input = parseStockTrade(body)
  return db.transaction(async (connection) => {
    const [account] = await connection
      .select()
      .from(accounts)
      .where(eq(accounts.id, input.accountId))
      .for("update")
    if (!account) throw new FinanceError("recordMissing", 404)
    if (account.type !== "investment") throw new FinanceError("invalidInput")
    const ledger = await readLedger(connection, [input.accountId])
    const reservations = await readReservedCash(connection, [input.accountId])
    const cash = ledger.summaries.find(
      (item) => item.id === input.accountId,
    )!.balance
    if (
      input.side === "buy" &&
      Math.round(cash * 100) + Math.round(tradeCashChange(input) * 100) <
        Math.round((reservations.reserved.get(input.accountId) ?? 0) * 100)
    )
      throw new FinanceError("insufficientAvailableCash", 409)
    await connection
      .insert(stockInstruments)
      .values({ symbol: input.symbol, name: input.symbol })
      .onConflictDoNothing()
    const [trade] = await connection
      .insert(stockTrades)
      .values(input)
      .returning()
    const updatedTrades = [...ledger.trades, trade]
    validateInvestmentAccount(
      account,
      ledger.transactions,
      updatedTrades,
      reservations.reserved.get(account.id) ?? 0,
    )
    return trade
  })
}

export async function removeStockTrade(db: UserDatabase, id: number) {
  return db.transaction(async (connection) => {
    const [trade] = await connection
      .select()
      .from(stockTrades)
      .where(eq(stockTrades.id, id))
    if (!trade) throw new FinanceError("recordMissing", 404)
    const [account] = await connection
      .select()
      .from(accounts)
      .where(eq(accounts.id, trade.accountId))
      .for("update")
    const ledger = await readLedger(connection, [trade.accountId])
    const remaining = ledger.trades.filter((item) => item.id !== id)
    const reservations = await readReservedCash(connection, [trade.accountId])
    validateInvestmentAccount(
      account,
      ledger.transactions,
      remaining,
      reservations.reserved.get(account.id) ?? 0,
    )
    await connection.delete(stockTrades).where(eq(stockTrades.id, id))
    return { id }
  })
}

export async function updateStockTrade(
  db: UserDatabase,
  id: number,
  body: unknown,
) {
  const input = parseStockTrade(body)
  return db.transaction(async (connection) => {
    const [existing] = await connection
      .select()
      .from(stockTrades)
      .where(eq(stockTrades.id, id))
    if (!existing) throw new FinanceError("recordMissing", 404)
    const affected = await connection
      .select()
      .from(accounts)
      .where(
        inArray(accounts.id, [
          ...new Set([existing.accountId, input.accountId]),
        ]),
      )
      .orderBy(asc(accounts.id))
      .for("update")
    const destination = affected.find(
      (account) => account.id === input.accountId,
    )
    if (!destination) throw new FinanceError("recordMissing", 404)
    if (destination.type !== "investment")
      throw new FinanceError("invalidInput")
    const accountIds = affected.map((account) => account.id)
    const ledger = await readLedger(connection, accountIds)
    const reservations = await readReservedCash(connection, accountIds)
    const candidate = { ...existing, ...input }
    const changedTrades = ledger.trades.map((trade) =>
      trade.id === id ? candidate : trade,
    )
    for (const account of affected)
      validateInvestmentAccount(
        account,
        ledger.transactions,
        changedTrades,
        reservations.reserved.get(account.id) ?? 0,
      )
    await connection
      .insert(stockInstruments)
      .values({ symbol: input.symbol, name: input.symbol })
      .onConflictDoNothing()
    const [updated] = await connection
      .update(stockTrades)
      .set(input)
      .where(eq(stockTrades.id, id))
      .returning()
    return updated
  })
}
