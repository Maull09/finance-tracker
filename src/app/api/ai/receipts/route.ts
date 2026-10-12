import { z } from "zod"
import { accountsExist } from "@/lib/accounts"
import { claimConversation, readConversation, releaseConversation, saveReply } from "@/lib/ai/conversations"
import { runReceipt } from "@/lib/ai/graph"
import { aiResponse, readBoundedBody, userDatabase } from "@/lib/ai/server"
import { MAX_RECEIPT_BYTES, RECEIPT_BUCKET, receiptMimeType } from "@/lib/ai/validation"
import { FinanceError } from "@/lib/finance-errors"
import { requireOllamaEnabled } from "@/lib/server/service-config"

export const runtime = "nodejs"
export const maxDuration = 180

async function readReceiptForm(request: Request) {
  const bytes = await readBoundedBody(request, MAX_RECEIPT_BYTES + 16_384)
  try {
    return await new Response(bytes, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData()
  } catch {
    throw new FinanceError("aiReceiptInvalid")
  }
}

export async function POST(request: Request) {
  return aiResponse(request, async ({ userId, supabase }) => {
    requireOllamaEnabled()
    const form = await readReceiptForm(request)
    const conversationId = z.uuid().parse(form.get("conversationId"))
    const locale = z.enum(["en", "id"]).parse(form.get("locale"))
    const rawAccount = form.get("accountId")
    const accountId = rawAccount ? z.coerce.number().int().positive().max(2_147_483_647).parse(rawAccount) : null
    if (accountId && !(await userDatabase(userId, (connection) => accountsExist(connection, accountId, null))))
      throw new FinanceError("invalidInput")
    const file = form.get("receipt")
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_RECEIPT_BYTES)
      throw new FinanceError("aiReceiptInvalid")
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mimeType = receiptMimeType(bytes)
    if (!mimeType || file.type !== mimeType) throw new FinanceError("aiReceiptInvalid")
    const claim = await claimConversation(userId, conversationId, locale === "id" ? "Baca struk ini." : "Read this receipt.")
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp"
    const storagePath = `${userId}/${conversationId}/${crypto.randomUUID()}.${extension}`
    let uploaded = false
    let saved = false
    try {
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).upload(storagePath, bytes, { contentType: mimeType, upsert: false })
      if (error) throw new FinanceError("aiStorageUnavailable", 503)
      uploaded = true
      const result = await runReceipt(bytes, mimeType, accountId)
      const note = locale === "id"
        ? "Struk sudah dibaca. Periksa nominal, tanggal, dan akun di draft sebelum mengonfirmasi."
        : "Receipt read. Check the amount, date and account in the draft before confirming."
      const currencyWarning = result.result.currency?.toUpperCase() !== "IDR"
        ? (locale === "id" ? " Mata uang IDR belum terverifikasi; masukkan nominal rupiah sendiri." : " IDR currency could not be verified; enter the rupiah amount yourself.") : ""
      await saveReply(userId, conversationId, note + currencyWarning + (result.result.notes ? "\n" + result.result.notes : ""),
        [result.draft], { storagePath, mimeType })
      saved = true
      return Response.json(await readConversation(userId, conversationId))
    } finally {
      if (uploaded && !saved) await supabase.storage.from(RECEIPT_BUCKET).remove([storagePath])
      await releaseConversation(userId, conversationId, claim.busyUntil)
    }
  })
}
