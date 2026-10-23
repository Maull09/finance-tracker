import { describe, expect, it } from "vitest"
import { canonicalInsightContext, insightRequestSchema } from "@/lib/ai/insight-contract"
import { insightJobId } from "@/lib/ai/insight-queue"

describe("page insight context", () => {
  it("keeps category filters in the insight context and cache identity", () => {
    const context = { page: "transactions" as const, filters: "type=all&category=Minuman&subcategory=Kopi" }
    expect(insightRequestSchema.safeParse({ context, locale: "id" }).success).toBe(true)
    expect(canonicalInsightContext(context)).toEqual({ page: "transactions", filters: "category=Minuman&subcategory=Kopi" })
    expect(insightJobId("alice", context, "id", "revision", 0)).not.toBe(
      insightJobId("alice", { ...context, filters: "category=Minuman" }, "id", "revision", 0),
    )
  })
  it("canonicalises filters and separates users, locales, periods and financial revisions", () => {
    const first = { page: "transactions" as const, filters: "type=all&search=&from=2026-09-01&account=all" }
    const second = { page: "transactions" as const, filters: "from=2026-09-01" }
    expect(canonicalInsightContext(first)).toEqual(second)
    const key = insightJobId("alice", first, "id", "revision", 0)
    expect(insightJobId("alice", second, "id", "revision", 0)).toBe(key)
    for (const [user, locale, revision] of [["bob", "id", "revision"], ["alice", "en", "revision"], ["alice", "id", "changed"]])
      expect(insightJobId(user, second, locale, revision, 0)).not.toBe(key)
    expect(insightJobId("alice", { page: "transactions", filters: "from=2026-08-01" }, "id", "revision", 0)).not.toBe(key)
    expect(insightJobId("alice", second, "id", "revision", 15 * 60_000)).not.toBe(key)
  })
  it("rejects identity injection, unsupported pages, unrelated inputs and pagination", () => {
    for (const context of [{ page: "ai" }, { page: "investments", userId: "bob" }, { page: "budget" },
      { page: "calendar", month: "2026-13" }, { page: "transactions", filters: "page=2" },
      { page: "transactions", filters: "from=2026-10-01&to=2026-09-01" },
      { page: "investments", input: { amount: 100 } }])
      expect(insightRequestSchema.safeParse({ context, locale: "id" }).success).toBe(false)
    expect(insightRequestSchema.safeParse({ context: { page: "dashboard" }, locale: "id", userId: "bob" }).success).toBe(false)
  })
  it("accepts health inputs with unknown amounts and all supported context families", () => {
    for (const page of ["dashboard", "investments", "goals", "debts", "netWorth", "funds"])
      expect(insightRequestSchema.safeParse({ context: { page }, locale: "en" }).success).toBe(true)
    expect(insightRequestSchema.parse({ context: { page: "financialHealth", input: { month: "2026-09", essentialExpense: null, monthlyDebtPayment: null } }, locale: "id" }).refresh).toBe(false)
  })
})
