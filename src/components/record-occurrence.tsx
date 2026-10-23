"use client"

import { useId, useState } from "react"
import { ErrorNotice, Field, SubmitButton, useFeedback } from "./feedback"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog"
import { getToday, isDate } from "@/lib/finance"
import { jsonBody, requestJson } from "@/lib/client-api"

export function RecordOccurrence({ occurrence, accountName, chooseScheduledDate = false }: {
  occurrence: { scheduleId: number; name: string; type: string; amount: number; date: string }
  accountName?: string
  chooseScheduledDate?: boolean
}) {
  const { t, formatCurrency, formatDate } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [scheduledDate, setScheduledDate] = useState(occurrence.date)
  const [date, setDate] = useState(getToday())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const today = getToday()
  const valid = isDate(date) && date >= "1900-01-01" && date <= today && isDate(scheduledDate) &&
    scheduledDate >= "1900-01-01" && scheduledDate <= "2100-12-31"

  async function record(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(`/api/recurring/${occurrence.scheduleId}/execute`, jsonBody("POST", { scheduledDate, date }))
      setOpen(false)
      notify("scheduleRecorded")
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (busy) return
      setOpen(value)
      if (value) { setScheduledDate(occurrence.date); setDate(getToday()); setError("") }
    }}>
      <DialogTrigger asChild><Button variant="outline" size="sm">{t("recordNow")}</Button></DialogTrigger>
      <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("recordNow")}</DialogTitle>
          <DialogDescription>{t("recordOccurrenceHint")}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border bg-muted/40 p-4">
          <p className="break-words font-semibold">{occurrence.name}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t(occurrence.type)}</p>
          <p className="mt-1 break-words text-xl font-semibold tabular-nums">{formatCurrency(occurrence.amount)}</p>
          {accountName && <p className="mt-2 break-words text-sm text-muted-foreground">{accountName}</p>}
          {!chooseScheduledDate && <p className="mt-2 text-sm">{t("scheduledDate")}: {formatDate(occurrence.date)}</p>}
        </div>
        <form onSubmit={record} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            {chooseScheduledDate && <Field id={id + "-scheduled"} label={t("scheduledDate")} hint={t("scheduledDateHint")} required>
              <Input id={id + "-scheduled"} type="date" min="1900-01-01" max="2100-12-31" required
                aria-describedby={id + "-scheduled-hint"} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
            </Field>}
            <Field id={id + "-actual"} label={t("actualTransactionDate")} hint={t("actualTransactionDateHint")} required>
              <Input id={id + "-actual"} type="date" min="1900-01-01" max={today} required
                aria-describedby={id + "-actual-hint"} value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
          </fieldset>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <SubmitButton busy={busy} disabled={!valid}>{t("recordNow")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
