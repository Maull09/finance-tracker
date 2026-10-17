"use client"

import { useRef, useState } from "react"
import { ReceiptText } from "lucide-react"
import { AiDraftForm, aiSelectClass } from "./ai-draft"
import { ErrorNotice, Field, LoadingState } from "./feedback"
import { useLanguage } from "./language-provider"
import { useAiAvailability } from "./ai-availability-provider"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { jsonBody, requestJson } from "@/lib/client-api"
import { clearRemoteResourceCache } from "@/lib/remote-resource-cache"
import { useRemoteData } from "@/lib/use-remote-data"
import { MAX_RECEIPT_BYTES } from "@/lib/ai/validation"
import type { AiConversation, AiConversationDetail, AiDraft } from "@/lib/ai/types"
import type { Account } from "@/lib/types"

export function AiTransactionDrafts({ accounts }: { accounts: Account[] }) {
  const { t } = useLanguage()
  const drafts = useRemoteData<AiDraft[]>("/api/ai/drafts")
  const [busy, setBusy] = useState(false)

  function reload() {
    clearRemoteResourceCache()
    drafts.reload()
  }

  if (drafts.loading) return <LoadingState />
  if (drafts.error) return <ErrorNotice message={drafts.error} onRetry={reload} />
  if (!drafts.data?.length) return null

  return (
    <section aria-labelledby="ai-pending-title" className="rounded-xl border bg-card p-4 sm:p-5">
      <h2 id="ai-pending-title" className="text-lg font-semibold">{t("aiPendingDrafts")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("aiPendingDraftsHint")}</p>
      {drafts.data.map((draft) => <AiDraftForm key={draft.id} draft={draft} accounts={accounts}
        disabled={busy} onBusy={setBusy} onSaved={reload} />)}
    </section>
  )
}

export function ReceiptReader({ accounts }: { accounts: Account[] }) {
  const { assistantEnabled } = useAiAvailability()
  const { t } = useLanguage()
  if (!assistantEnabled) return (
    <Button variant="outline" disabled title={t("aiDisabled")}>
      <ReceiptText aria-hidden="true" />{t("aiReadReceipt")}
    </Button>
  )
  return <ReceiptDialog accounts={accounts} />
}

function ReceiptDialog({ accounts }: { accounts: Account[] }) {
  const { t, locale } = useLanguage()
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [accountId, setAccountId] = useState("")
  const [reading, setReading] = useState(false)
  const [draftBusy, setDraftBusy] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<AiConversationDetail | null>(null)
  const conversationId = useRef("")
  const submitting = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = reading || draftBusy

  async function readReceipt() {
    if (submitting.current) return
    if (!file || file.size === 0 || file.size > MAX_RECEIPT_BYTES || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("aiReceiptInvalid")
      return
    }
    submitting.current = true
    setReading(true)
    setError("")
    setResult(null)
    try {
      if (!conversationId.current) {
        const conversation = await requestJson<AiConversation>("/api/ai/conversations", jsonBody("POST", { title: t("aiReadReceipt") }))
        conversationId.current = conversation.id
      }
      const form = new FormData()
      form.set("conversationId", conversationId.current)
      form.set("locale", locale)
      form.set("accountId", accountId)
      form.set("receipt", file)
      const detail = await requestJson<AiConversationDetail>("/api/ai/receipts", { method: "POST", body: form })
      setResult(detail)
      conversationId.current = ""
      setFile(null)
      if (fileInput.current) fileInput.current.value = ""
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "serviceUnavailable")
    } finally {
      submitting.current = false
      setReading(false)
      window.dispatchEvent(new Event("finance-data-changed"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><ReceiptText aria-hidden="true" />{t("aiReadReceipt")}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("aiReadReceipt")}</DialogTitle>
          <DialogDescription>{t("aiReceiptDescription")}</DialogDescription>
        </DialogHeader>
        <div aria-busy={busy} className="min-w-0 space-y-4">
          <form onSubmit={(event) => { event.preventDefault(); void readReceipt() }} className="space-y-4">
            <Field id="transaction-receipt" label={t("aiReceipt")} hint={t("aiReceiptHint")}>
              <Input ref={fileInput} id="transaction-receipt" type="file" accept="image/jpeg,image/png,image/webp"
                required={!file} disabled={busy} aria-describedby="transaction-receipt-hint"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
              {file && <p className="mt-2 break-words text-xs text-muted-foreground">{file.name}</p>}
            </Field>
            <Field id="transaction-receipt-account" label={t("aiReceiptAccount")}>
              <select id="transaction-receipt-account" className={aiSelectClass} value={accountId} disabled={busy}
                onChange={(event) => setAccountId(event.target.value)}>
                <option value="">{t("aiChooseLater")}</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
            <ErrorNotice message={error} />
            <Button type="submit" disabled={busy || !file}>{t(reading ? "aiReading" : "aiReadReceipt")}</Button>
            {reading && <p role="status" className="text-sm text-muted-foreground">{t("aiReading")}</p>}
          </form>
          {result && <div>
            <p role="status" className="whitespace-pre-wrap break-words text-sm leading-relaxed">{result.messages.at(-1)?.content}</p>
            {result.drafts.map((draft) => <AiDraftForm key={draft.id} draft={draft} accounts={accounts}
              disabled={busy} onBusy={setDraftBusy} onSaved={() => window.dispatchEvent(new Event("finance-data-changed"))} />)}
          </div>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
