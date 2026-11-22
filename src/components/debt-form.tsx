"use client"

import { MoneyInput } from "./money-input"
import { parseTransactionAmount } from "@/lib/transaction-amount"

import { useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { ErrorNotice, Field, SubmitButton, useFeedback } from "./feedback"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"
import { Input } from "./ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"
import { requestJson, jsonBody } from "@/lib/client-api"

export type Debt = {
  id: number
  type: "utang" | "piutang"
  name: string
  amount: number
  paidAmount: number
  description: string | null
  status: "unpaid" | "paid"
  dueDate: string | null
}

export function AddDebtForm({
  onAdded,
  debt,
}: {
  onAdded?: () => void
  debt?: Debt
}) {
  const { t } = useLanguage()
  const notify = useFeedback()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"utang" | "piutang">("utang")
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    try {
      await requestJson(
        "/api/debts" + (debt ? "/" + debt.id : ""),
        jsonBody(debt ? "PATCH" : "POST", {
          type,
          name,
          amount,
          description,
          dueDate,
        }),
      )
      setOpen(false)
      setName("")
      setAmount("")
      setDescription("")
      setDueDate("")
      notify(debt ? "debtUpdated" : "debtSaved")
      onAdded?.()
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value)
          setError("")
          if (value && debt) {
            setType(debt.type)
            setName(debt.name)
            setAmount(String(debt.amount))
            setDescription(debt.description ?? "")
            setDueDate(debt.dueDate ?? "")
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={debt ? "ghost" : "default"}
          size={debt ? "sm" : "default"}
          aria-label={debt ? t("edit") + " " + debt.name : undefined}
        >
          {debt ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {t(debt ? "edit" : "addDebt")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!busy} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(debt ? "editDebt" : "addDebt")}</DialogTitle>
          <DialogDescription>
            {t(debt ? "editDebtHint" : "requiredHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <Field id="debt-type" label={t("type")} required>
              <Select
                value={type}
                disabled={Boolean(debt?.paidAmount)}
                onValueChange={(value) => setType(value as "utang" | "piutang")}
              >
                <SelectTrigger id="debt-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utang">{t("debt")}</SelectItem>
                  <SelectItem value="piutang">{t("receivable")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="debt-name" label={t("counterparty")} required>
              <Input
                id="debt-name"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field id="debt-amount" label={t("amountIdr")} required>
              <MoneyInput
                id="debt-amount"
                min={Math.max(0.01, debt?.paidAmount ?? 0)}
                max="2147483647"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </Field>
            <Field id="debt-note" label={t("note")}>
              <Input
                id="debt-note"
                maxLength={500}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field
              id="debt-date"
              label={t("dueDate") + " (" + t("optional") + ")"}
            >
              <Input
                id="debt-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
          </fieldset>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <SubmitButton
              busy={busy}
              disabled={!name.trim() || parseTransactionAmount(amount) === null}
            >
              {t(debt ? "saveChanges" : "saveDebt")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
