import { describe, expect, it } from "vitest"
import { expenseCategories, getCategories, getSubcategories, incomeCategories } from "@/lib/categories"
import { messages } from "@/lib/i18n"
import { parseTransactionInput } from "@/lib/validation"
import { parseRecurring } from "@/lib/planning-validation"
import { confirmedDraftSchema, receiptSchema } from "@/lib/ai/validation"

const expense = { type: "expense", category: "Minuman", amount: 25000, accountId: 1, date: "2026-10-23" }

describe("transaction categorization", () => {
  it("offers broader categories and translates every category and subcategory", () => {
    expect(expenseCategories).toEqual(expect.arrayContaining(["Minuman", "Utang", "Piutang", "Rumah tangga", "Langganan"]))
    expect(incomeCategories).toEqual(expect.arrayContaining(["Utang", "Piutang", "Usaha"]))
    for (const type of ["income", "expense", "transfer"] as const) {
      for (const category of getCategories(type)) {
        for (const label of [category, ...getSubcategories(type, category)]) {
          expect(messages.en[label], label).toBeTruthy()
          expect(messages.id[label], label).toBeTruthy()
        }
      }
    }
  })
  it("normalizes a subcategory and preserves the parent for budget aggregation", () => {
    expect(parseTransactionInput({ ...expense, subcategory: " Kopi " }))
      .toMatchObject({ category: "Minuman", subcategory: "Kopi", amount: 25000 })
    expect(parseTransactionInput({ ...expense, subcategory: "Teh" }))
      .toMatchObject({ category: "Minuman", subcategory: "Teh" })
  })
  it.each([
    ["Laundry", "Cuci dan setrika"],
    ["Pakaian", "Atasan"],
    ["Barang kebutuhan", "Perlengkapan mandi"],
    ["Barang lainnya", "Perlengkapan hobi"],
  ])("accepts %s with its subcategory across transactions, schedules, AI drafts and receipts", (category, subcategory) => {
    expect(expenseCategories).toContain(category)
    expect(incomeCategories).not.toContain(category)
    const input = { ...expense, category, subcategory }
    expect(parseTransactionInput(input)).toMatchObject({ category, subcategory })
    expect(parseRecurring({ ...input, name: category, frequency: "monthly", startDate: input.date }))
      .toMatchObject({ category, subcategory })
    expect(confirmedDraftSchema.safeParse({ ...input, description: category, destinationAccountId: null }).success).toBe(true)
    expect(receiptSchema.safeParse({ merchant: null, total: 25000, currency: "IDR", date: input.date, category, notes: "" }).success).toBe(true)
    expect(parseTransactionInput({ ...input, subcategory: "Kopi" })).toBeNull()
  })
  it("keeps existing shopping and household classifications valid", () => {
    expect(parseTransactionInput({ ...expense, category: "Belanja", subcategory: "Pakaian" }))
      .toMatchObject({ category: "Belanja", subcategory: "Pakaian" })
    expect(parseTransactionInput({ ...expense, category: "Rumah tangga", subcategory: "Kebutuhan kebersihan" }))
      .toMatchObject({ category: "Rumah tangga", subcategory: "Kebutuhan kebersihan" })
  })
  it.each([undefined, null, ""])("accepts older records and optional subcategories: %s", (subcategory) => {
    expect(parseTransactionInput({ ...expense, category: "Kategori lama", subcategory }))
      .toMatchObject({ category: "Kategori lama", subcategory: null })
  })
  it.each(["Bahan bakar", "unknown", " ", 42, {}, "x".repeat(121)])("rejects invalid child categories before saving: %s", (subcategory) => {
    expect(parseTransactionInput({ ...expense, subcategory })).toBeNull()
  })
  it("distinguishes loan cash directions and keeps transfers free of subcategories", () => {
    for (const [type, category, subcategory] of [
      ["income", "Utang", "Pinjaman diterima"], ["expense", "Utang", "Pembayaran utang"],
      ["income", "Piutang", "Penerimaan piutang"], ["expense", "Piutang", "Pinjaman diberikan"],
    ]) expect(parseTransactionInput({ ...expense, type, category, subcategory })).toMatchObject({ type, category, subcategory })
    expect(parseTransactionInput({ ...expense, type: "income", category: "Utang", subcategory: "Pembayaran utang" })).toBeNull()
    expect(parseTransactionInput({ ...expense, type: "transfer", destinationAccountId: 2, subcategory: "Kopi" })).toBeNull()
    expect(getSubcategories("expense", "__proto__")).toEqual([])
  })
  it("applies the same hierarchy to recurring entries and confirmed AI drafts", () => {
    expect(parseRecurring({ ...expense, subcategory: "Kopi", name: "Coffee", frequency: "monthly", startDate: expense.date }))
      .toMatchObject({ category: "Minuman", subcategory: "Kopi" })
    expect(() => parseRecurring({ ...expense, subcategory: "Listrik", name: "Coffee", frequency: "monthly", startDate: expense.date })).toThrow()
    const draft = { ...expense, description: "Coffee", destinationAccountId: null }
    expect(confirmedDraftSchema.safeParse({ ...draft, subcategory: "Kopi" }).success).toBe(true)
    expect(confirmedDraftSchema.safeParse({ ...draft, subcategory: "Listrik" }).success).toBe(false)
    expect(confirmedDraftSchema.safeParse(draft).success).toBe(true)
    expect(receiptSchema.safeParse({ merchant: null, total: null, currency: null, date: null, category: "Minuman", notes: "" }).success).toBe(true)
  })
})
