import { describe, expect, it } from "vitest"
import { parseTransactionInput } from "@/lib/validation"

const expense = {
  type: "expense", amount: 100_000, category: "Makanan",
  date: "2026-10-09", accountId: 1,
}

describe("transaction decimal amounts", () => {
  it.each([243060.44, "243060.44", "243060,44"])("preserves two decimals from %s", (amount) => {
    expect(parseTransactionInput({ ...expense, amount })?.amount).toBe(243060.44)
  })
  it.each(["0.01", "0,01", 0.01, "2147483647", "1.20"])("accepts valid monetary boundaries: %s", (amount) => {
    expect(parseTransactionInput({ ...expense, amount })).not.toBeNull()
  })
  it.each([0, -1, "0,00", "243.060,44", "243,060.44", "1.234", "1,234", "1e3", true, null, "", " ", Infinity, NaN, "2147483647.01"])("rejects invalid amount without rounding: %s", (amount) => {
    expect(parseTransactionInput({ ...expense, amount })).toBeNull()
  })
  it("does not accept decimal account identifiers", () => {
    expect(parseTransactionInput({ ...expense, amount: "1,25", accountId: 1.5 })).toBeNull()
  })
})

describe("transaction groups", () => {
  it("normalizes group names and accepts transactions without a group", () => {
    expect(parseTransactionInput({ ...expense, groupName: "  Liburan Jepang  " }))
      .toMatchObject({ groupName: "Liburan Jepang", amount: 100_000 })
    for (const groupName of [undefined, null, "", "   "])
      expect(parseTransactionInput({ ...expense, groupName })).toMatchObject({ groupName: null })
  })
  it.each([42, {}, [], true, "x".repeat(101)])("rejects invalid group names: %s", (groupName) => {
    expect(parseTransactionInput({ ...expense, groupName })).toBeNull()
  })
  it("accepts a group name at the length limit", () => {
    expect(parseTransactionInput({ ...expense, groupName: "x".repeat(100) }))
      .toMatchObject({ groupName: "x".repeat(100) })
  })
})
