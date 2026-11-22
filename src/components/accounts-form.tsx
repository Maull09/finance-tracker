"use client"

import { MoneyInput } from "./money-input"

import { useId, useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { useLanguage } from "./language-provider"
import { ErrorNotice, Field, SubmitButton, useFeedback } from "./feedback"
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
import { accountTypes, type AccountType } from "@/lib/finance"
import { jsonBody, requestJson } from "@/lib/client-api"
import type { Account } from "@/lib/types"

export function AddAccountForm({
  onAdded,
  defaultType = "bank",
  account,
}: {
  onAdded?: () => void
  defaultType?: AccountType
  account?: Account
}) {
  const { t } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [type, setType] = useState<AccountType>(defaultType)
  const [initialBalance, setInitialBalance] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError("")
    try {
      await requestJson(
        account ? "/api/accounts/" + account.id : "/api/accounts",
        jsonBody(account ? "PATCH" : "POST", {
          name,
          type,
          initialBalance,
          description,
        }),
      )
      setOpen(false)
      setName("")
      setInitialBalance("")
      setDescription("")
      notify(account ? "accountUpdated" : "accountSaved")
      onAdded?.()
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!loading) {
          setOpen(value)
          setError("")
          if (value && account) {
            setName(account.name)
            setType(account.type)
            setInitialBalance(String(account.initialBalance))
            setDescription(account.description ?? "")
          }
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={account ? "ghost" : "outline"}
          size={account ? "sm" : "default"}
          aria-label={account ? t("edit") + " " + account.name : undefined}
        >
          {account ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t(account ? "edit" : "addAccount")}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={!loading} className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(account ? "editAccount" : "addAccount")}</DialogTitle>
          <DialogDescription>
            {t(account ? "editAccountHint" : "requiredHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={loading} className="space-y-4">
            <Field id={id + "-name"} label={t("name")} required>
              <Input
                id={id + "-name"}
                placeholder={t("accountName")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                required
              />
            </Field>
            <Field id={id + "-type"} label={t("accountType")} required>
              <Select
                value={type}
                onValueChange={(value) => setType(value as AccountType)}
              >
                <SelectTrigger id={id + "-type"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id={id + "-balance"}
              label={t("openingBalance")}
              hint={t(
                type === "investment"
                  ? "investmentOpeningHint"
                  : "openingBalanceHint",
              )}
            >
              <MoneyInput
                id={id + "-balance"}
                min="-2147483648"
                aria-describedby={id + "-balance-hint"}
                placeholder="0"
                value={initialBalance}
                onChange={(event) => setInitialBalance(event.target.value)}
              />
            </Field>
            <Field id={id + "-note"} label={t("note")}>
              <Input
                id={id + "-note"}
                value={description}
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
          </fieldset>
          <ErrorNotice message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <SubmitButton busy={loading} disabled={!name.trim()}>
              {t(account ? "saveChanges" : "saveAccount")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
