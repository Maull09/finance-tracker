"use client"

import { useState } from "react"
import { useLanguage } from "./language-provider"
import { ErrorNotice, Field } from "./feedback"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { jsonBody, requestJson } from "@/lib/client-api"
import { confirmedDraftSchema, type AiDraftInput } from "@/lib/ai/validation"
import type { AiDraft } from "@/lib/ai/types"
import type { Account } from "@/lib/types"
import { CategoryFields } from "./category-fields"

export const aiSelectClass = "min-h-11 w-full rounded-lg border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"

export function AiDraftForm({ draft, accounts, disabled, onSaved, onBusy }: {
  draft: AiDraft; accounts: Account[]; disabled: boolean; onSaved: () => void; onBusy: (value: boolean) => void
}) {
  const { t, formatCurrency } = useLanguage()
  const [data, setData] = useState<AiDraftInput>(draft.data)
  const [status, setStatus] = useState(draft.status)
  const [working, setWorking] = useState<"confirm" | "reject" | null>(null)
  const [error, setError] = useState("")
  const prefix = "draft-" + draft.id
  const unavailable = disabled || working !== null

  async function decide(action: "confirm" | "reject") {
    setError("")
    const parsed = confirmedDraftSchema.safeParse(data)
    if (action === "confirm" && !parsed.success) {
      setError("aiMissingFields")
      return
    }
    setWorking(action)
    onBusy(true)
    try {
      await requestJson(`/api/ai/drafts/${draft.id}`, jsonBody("POST", action === "confirm"
        ? { action, data: parsed.data } : { action }))
      setStatus(action === "confirm" ? "confirmed" : "rejected")
      if (action === "confirm") window.dispatchEvent(new Event("finance-data-changed"))
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "serviceUnavailable")
    } finally {
      setWorking(null)
      onBusy(false)
    }
  }

  return (
    <section aria-labelledby={prefix + "-title"} className="mt-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={prefix + "-title"} className="font-semibold">{t("aiDraft")}</h3>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums">{data.amount ? formatCurrency(data.amount) : t("aiAmount")}</p>
        </div>
        {draft.receiptId && <a href={`/api/ai/receipts/${draft.receiptId}`} target="_blank" rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm text-brand-active underline focus-visible:outline-2">{t("aiViewReceipt")}</a>}
      </div>
      {status !== "pending" ? <p role="status" className="text-sm font-medium">{t(status === "confirmed" ? "aiConfirmed" : "aiRejected")}</p> : (
        <form onSubmit={(event) => { event.preventDefault(); void decide("confirm") }} className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("aiDraftHint")}</p>
          <fieldset disabled={unavailable} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <Field id={prefix + "-type"} label={t("aiType")}>
              <select id={prefix + "-type"} className={aiSelectClass} value={data.type} onChange={(event) => setData({
                ...data, type: event.target.value as AiDraftInput["type"], destinationAccountId: null,
                category: event.target.value === "transfer" ? "Transfer antar akun" : "", subcategory: null,
              })}>
                {["income", "expense", "transfer"].map((type) => <option key={type} value={type}>{t(type)}</option>)}
              </select>
            </Field>
            <Field id={prefix + "-amount"} label={t("aiAmount")} required>
              <Input id={prefix + "-amount"} type="number" inputMode="numeric" required min="1" max="2147483647" step="1"
                value={data.amount ?? ""} onChange={(event) => setData({ ...data, amount: event.target.value === "" ? null : Number(event.target.value) })} />
            </Field>
            {data.type !== "transfer" && <CategoryFields id={prefix} type={data.type} category={data.category} subcategory={data.subcategory}
              onChange={(category, subcategory) => setData({ ...data, category, subcategory })} />}
            <Field id={prefix + "-date"} label={t("aiDate")} required>
              <Input id={prefix + "-date"} type="date" required value={data.date ?? ""} onChange={(event) => setData({ ...data, date: event.target.value || null })} />
            </Field>
            <Field id={prefix + "-account"} label={t("aiAccount")} required>
              <select id={prefix + "-account"} required className={aiSelectClass} value={data.accountId ?? ""}
                onChange={(event) => setData({ ...data, accountId: Number(event.target.value) || null })}>
                <option value="">{t("aiSelectAccount")}</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
            {data.type === "transfer" && <Field id={prefix + "-destination"} label={t("aiDestination")} required>
              <select id={prefix + "-destination"} required className={aiSelectClass} value={data.destinationAccountId ?? ""}
                onChange={(event) => setData({ ...data, destinationAccountId: Number(event.target.value) || null })}>
                <option value="">{t("aiSelectAccount")}</option>
                {accounts.filter((account) => account.id !== data.accountId).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>}
            <div className="sm:col-span-2">
              <Field id={prefix + "-description"} label={t("aiDescriptionField")}>
                <Input id={prefix + "-description"} maxLength={1000} value={data.description} onChange={(event) => setData({ ...data, description: event.target.value })} />
              </Field>
            </div>
          </fieldset>
          {!accounts.length && <p className="text-sm text-muted-foreground">{t("aiNoAccounts")}</p>}
          <ErrorNotice message={error} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={unavailable || !accounts.length}>{t(working === "confirm" ? "aiSaving" : "aiConfirm")}</Button>
            <Button type="button" variant="outline" disabled={unavailable} onClick={() => void decide("reject")}>{t(working === "reject" ? "aiRejecting" : "aiReject")}</Button>
          </div>
        </form>
      )}
    </section>
  )
}
