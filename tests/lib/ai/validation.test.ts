import { describe, expect, it } from "vitest"
import { aiDraftSchema, confirmedDraftSchema, draftDecisionSchema, receiptMimeType, receiptSchema } from "@/lib/ai/validation"

const draft = { type: "expense", amount: 25000, category: "Makanan", description: "Lunch", date: "2026-10-09", accountId: 1, destinationAccountId: null }

describe("AI financial input validation", () => {
  it("allows unknown fields in a draft but refuses to confirm them", () => {
    const incomplete = { ...draft, amount: null, date: null, accountId: null }
    expect(aiDraftSchema.safeParse(incomplete).success).toBe(true)
    expect(confirmedDraftSchema.safeParse(incomplete).success).toBe(false)
  })
  it.each([0, -1, 1.555, 2147483648, Number.NaN])("rejects unsafe IDR amount %s", (amount) => {
    expect(confirmedDraftSchema.safeParse({ ...draft, amount }).success).toBe(false)
  })
  it("rejects invalid calendar dates and hidden model control fields", () => {
    expect(confirmedDraftSchema.safeParse({ ...draft, date: "2026-02-30" }).success).toBe(false)
    expect(aiDraftSchema.safeParse({ ...draft, userId: "another-user" }).success).toBe(false)
    expect(draftDecisionSchema.safeParse({ action: "confirm", data: draft, approved: true }).success).toBe(false)
  })
  it("requires a separate destination for transfers and no destination for expenses", () => {
    expect(confirmedDraftSchema.safeParse({ ...draft, type: "transfer" }).success).toBe(false)
    expect(confirmedDraftSchema.safeParse({ ...draft, type: "transfer", destinationAccountId: 1 }).success).toBe(false)
    expect(confirmedDraftSchema.safeParse({ ...draft, type: "transfer", destinationAccountId: 2 }).success).toBe(true)
    expect(confirmedDraftSchema.safeParse({ ...draft, destinationAccountId: 2 }).success).toBe(false)
  })
  it("rejects fabricated dates and receipt totals with excessive precision", () => {
    const receipt = { merchant: null, total: null, currency: null, date: null, category: "Lainnya", notes: "Unreadable" }
    expect(receiptSchema.safeParse(receipt).success).toBe(true)
    expect(receiptSchema.safeParse({ ...receipt, date: "2026-13-01" }).success).toBe(false)
    expect(receiptSchema.safeParse({ ...receipt, total: 12.555 }).success).toBe(false)
  })
  it("checks file signatures rather than trusting a claimed image MIME type", () => {
    expect(receiptMimeType(new TextEncoder().encode("<svg onload='alert(1)'>"))).toBeNull()
    expect(receiptMimeType(new Uint8Array([255, 216, 255, 224]))).toBe("image/jpeg")
    expect(receiptMimeType(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]))).toBe("image/png")
    expect(receiptMimeType(new TextEncoder().encode("RIFF0000WEBP"))).toBe("image/webp")
  })
})
