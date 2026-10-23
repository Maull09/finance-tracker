"use client"

import { useId, useState } from "react"
import { Plus } from "lucide-react"
import { ErrorNotice, Field, SubmitButton, useFeedback } from "./feedback"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"
import { TransactionGroupField } from "./transaction-group-field"
import { CategoryFields } from "./category-fields"
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
import {
  getToday,
  type TransactionType,
} from "@/lib/finance"
import { jsonBody, requestJson } from "@/lib/client-api"
import type { Account, Transaction } from "@/lib/types"

export function TransactionForm({
  accounts,
  transaction,
  defaultGroupName,
  onSaved,
}: {
  accounts: Account[]
  transaction?: Transaction
  defaultGroupName?: string
  onSaved: () => void
}) {
  const { t, formatCurrency } = useLanguage()
  const notify = useFeedback()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<TransactionType>("expense")
  const [amount, setAmount] = useState("")
  const [category, setCategory] = useState("")
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [accountId, setAccountId] = useState("")
  const [destinationAccountId, setDestinationAccountId] = useState("")
  const [description, setDescription] = useState("")
  const [groupChoice, setGroupChoice] = useState("none")
  const [groupName, setGroupName] = useState("")
  const [date, setDate] = useState(getToday())
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function changeOpen(value: boolean) {
    if (loading) return
    setOpen(value)
    if (!value) return
    setType(transaction?.type ?? "expense")
    setAmount(transaction ? String(transaction.amount) : "")
    setCategory(transaction?.category ?? "")
    setSubcategory(transaction?.subcategory ?? null)
    setAccountId(
      transaction
        ? String(transaction.accountId)
        : accounts.length === 1
          ? String(accounts[0].id)
          : "",
    )
    setDestinationAccountId(
      transaction?.destinationAccountId
        ? String(transaction.destinationAccountId)
        : "",
    )
    setDescription(transaction?.description ?? "")
    const initialGroup = transaction ? transaction.groupName : defaultGroupName
    setGroupChoice(initialGroup ? "group:" + initialGroup : "none")
    setGroupName(initialGroup ?? "")
    setDate(transaction?.date ?? getToday())
    setError("")
  }

  function changeType(value: TransactionType) {
    setType(value)
    setCategory(value === "transfer" ? "Transfer antar akun" : "")
    setSubcategory(null)
    setDestinationAccountId("")
  }

  const valid =
    Number.isSafeInteger(Number(amount)) &&
    Number(amount) > 0 &&
    category &&
    accountId &&
    date &&
    (groupChoice !== "new" || groupName.trim().length > 0) &&
    (type !== "transfer" ||
      (destinationAccountId && destinationAccountId !== accountId))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || loading) return
    setLoading(true)
    setError("")
    try {
      const selectedGroup =
        groupChoice === "none"
          ? null
          : groupChoice === "new"
            ? groupName.trim()
            : groupChoice.slice(6)
      const onlyGroupChanged =
        transaction &&
        type === transaction.type &&
        Number(amount) === transaction.amount &&
        category === transaction.category &&
        subcategory === transaction.subcategory &&
        Number(accountId) === transaction.accountId &&
        (type === "transfer" ? Number(destinationAccountId) : null) ===
          transaction.destinationAccountId &&
        description.trim() === (transaction.description ?? "") &&
        date === transaction.date
      await requestJson(
        transaction
          ? "/api/transactions/" + transaction.id
          : "/api/transactions",
        jsonBody(
          transaction ? "PATCH" : "POST",
          onlyGroupChanged
            ? { groupName: selectedGroup }
            : {
                type,
                amount,
                category,
                subcategory,
                accountId,
                destinationAccountId:
                  type === "transfer" ? destinationAccountId : null,
                description,
                groupName: selectedGroup,
                date,
              },
        ),
      )
      setOpen(false)
      notify(onlyGroupChanged ? "transactionGroupSaved" : "transactionSaved")
      onSaved()
      window.dispatchEvent(new Event("finance-data-changed"))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant={transaction ? "outline" : "default"}
          disabled={accounts.length === 0}
          title={accounts.length === 0 ? t("accountCreateHint") : undefined}
        >
          {!transaction && <Plus className="h-4 w-4" />}
          {t(transaction ? "edit" : "addTransaction")}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={!loading}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {t(transaction ? "editTransaction" : "recordTransaction")}
          </DialogTitle>
          <DialogDescription>{t("requiredHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={loading} className="space-y-4">
            <Field id={id + "-type"} label={t("transactionType")} required>
              <Select
                value={type}
                onValueChange={(value) => changeType(value as TransactionType)}
              >
                <SelectTrigger id={id + "-type"}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">{t("income")}</SelectItem>
                  <SelectItem value="expense">{t("expense")}</SelectItem>
                  <SelectItem value="transfer" disabled={accounts.length < 2}>
                    {t("transfer")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {accounts.length < 2 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {t("transferNeedsAccounts")}
              </p>
            )}
            {type === "transfer" && (
              <p className="rounded-lg bg-brand-soft p-3 text-sm text-brand-active">
                {t("transferHint")}
              </p>
            )}
            <Field
              id={id + "-amount"}
              label={t("amountIdr")}
              hint={t("amountHint")}
              required
            >
              <Input
                id={id + "-amount"}
                aria-describedby={id + "-amount-hint"}
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
              {Number(amount) > 0 && (
                <p className="text-sm font-medium text-brand-active">
                  {formatCurrency(Number(amount))}
                </p>
              )}
            </Field>
            {type !== "transfer" && (
              <CategoryFields id={id} type={type} category={category} subcategory={subcategory}
                onChange={(category, subcategory) => { setCategory(category); setSubcategory(subcategory) }} />
            )}
            <Field
              id={id + "-account"}
              label={t(type === "transfer" ? "sourceAccount" : "account")}
              required
            >
              <Select
                value={accountId}
                onValueChange={(value) => {
                  setAccountId(value)
                  if (value === destinationAccountId)
                    setDestinationAccountId("")
                }}
                required
              >
                <SelectTrigger id={id + "-account"}>
                  <SelectValue placeholder={t("chooseAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={String(account.id)}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {type === "transfer" && (
              <Field
                id={id + "-destination"}
                label={t("destinationAccount")}
                required
              >
                <Select
                  value={destinationAccountId}
                  onValueChange={setDestinationAccountId}
                  required
                >
                  <SelectTrigger id={id + "-destination"}>
                    <SelectValue placeholder={t("chooseAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((account) => String(account.id) !== accountId)
                      .map((account) => (
                        <SelectItem key={account.id} value={String(account.id)}>
                          {account.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field id={id + "-date"} label={t("date")} required>
              <Input
                id={id + "-date"}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
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
            <TransactionGroupField
              id={id + "-group"}
              choice={groupChoice}
              name={groupName}
              onChoiceChange={(value) => {
                setGroupChoice(value)
                if (value === "new") setGroupName("")
              }}
              onNameChange={setGroupName}
            />
          </fieldset>
          <ErrorNotice message={error} />
          {!valid && (
            <p className="text-xs text-muted-foreground">
              {t("selectRequired")}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
            <SubmitButton busy={loading} disabled={!valid}>
              {t("saveTransaction")}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
