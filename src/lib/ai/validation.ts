import { z } from "zod"
import { isDate } from "@/lib/finance"
import { expenseCategories, isValidSubcategory } from "@/lib/categories"

const amount = z.number().int().positive().max(2_147_483_647)
const accountId = z.number().int().positive().max(2_147_483_647)
const date = z.string().refine(isDate, "invalidInput")

export const aiDraftSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: amount.nullable(),
  category: z.string().trim().min(1).max(120),
  subcategory: z.string().trim().min(1).max(120).nullable().optional(),
  description: z.string().trim().max(1000),
  date: date.nullable(),
  accountId: accountId.nullable(),
  destinationAccountId: accountId.nullable(),
}).strict()

export type AiDraftInput = z.infer<typeof aiDraftSchema>

export const confirmedDraftSchema = aiDraftSchema.extend({
  amount, date, accountId,
}).superRefine((value, context) => {
  if (!isValidSubcategory(value.type, value.category, value.subcategory)) {
    context.addIssue({ code: "custom", path: ["subcategory"], message: "invalidInput" })
  }
  if (value.type === "transfer" &&
      (!value.destinationAccountId || value.destinationAccountId === value.accountId)) {
    context.addIssue({ code: "custom", path: ["destinationAccountId"], message: "invalidInput" })
  }
  if (value.type !== "transfer" && value.destinationAccountId !== null) {
    context.addIssue({ code: "custom", path: ["destinationAccountId"], message: "invalidInput" })
  }
})

export const chatSchema = z.object({
  conversationId: z.uuid(),
  message: z.string().trim().min(1).max(4000),
  locale: z.enum(["en", "id"]),
}).strict()

export const receiptSchema = z.object({
  merchant: z.string().max(120).nullable(),
  total: amount.nullable(),
  currency: z.string().max(12).nullable(),
  date: date.nullable(),
  category: z.enum(expenseCategories),
  notes: z.string().max(1000),
}).strict()

export const draftDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm"), data: confirmedDraftSchema }).strict(),
  z.object({ action: z.literal("reject") }).strict(),
])

export const RECEIPT_BUCKET = "ai-receipts"
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024

export function receiptMimeType(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg"
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) return "image/png"
  if (new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP") return "image/webp"
  return null
}
