"use client"

import { useEffect, useRef, type ComponentProps } from "react"
import { useLanguage } from "./language-provider"
import { Input } from "./ui/input"
import { parseMoneyInput } from "@/lib/money-input"

export function MoneyInput({
  id, value, min = "0.01", max = "2147483647", ...props
}: Omit<ComponentProps<typeof Input>, "type" | "inputMode" | "step"> & { id: string }) {
  const { t, formatCurrency } = useLanguage()
  const hintId = id + "-money-hint"
  const amount = parseMoneyInput(value, Number(min), Number(max))
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.setCustomValidity(value === "" || amount !== null ? "" : t("moneyAmountInvalid"))
  }, [value, amount, t])
  return <>
    <Input {...props} ref={inputRef} id={id} type="text" inputMode="decimal" value={value}
      pattern={Number(min) < 0 ? "-?[0-9]+([.,][0-9]{1,2})?" : "[0-9]+([.,][0-9]{1,2})?"}
      aria-describedby={[props["aria-describedby"], hintId].filter(Boolean).join(" ")} />
    {amount !== null && <p className="break-words text-sm tabular-nums text-brand-active">{formatCurrency(amount)}</p>}
    <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">{t("moneyAmountHint")}</p>
  </>
}
