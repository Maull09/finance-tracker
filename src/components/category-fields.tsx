"use client"

import { Field } from "./feedback"
import { useLanguage } from "./language-provider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { getCategories, getSubcategories } from "@/lib/categories"
import type { TransactionType } from "@/lib/finance"

export function CategoryFields({ id, type, category, subcategory, onChange, filter = false }: {
  id: string
  type: TransactionType | "all"
  category: string
  subcategory: string | null | undefined
  onChange: (category: string, subcategory: string | null) => void
  filter?: boolean
}) {
  const { t } = useLanguage()
  const categories = getCategories(type)
  const availableCategories = category && !categories.includes(category) ? [category, ...categories] : categories
  const subcategories = getSubcategories(type, category)
  return (
    <>
      <Field id={id + "-category"} label={t("category")} required={!filter}>
        <Select value={category || (filter ? "all-categories" : "")} required={!filter}
          onValueChange={(value) => onChange(filter && value === "all-categories" ? "" : value, null)}>
          <SelectTrigger id={id + "-category"}><SelectValue placeholder={t("chooseCategory")} /></SelectTrigger>
          <SelectContent>
            {filter && <SelectItem value="all-categories">{t("allCategories")}</SelectItem>}
            {availableCategories.map((item) => <SelectItem key={item} value={item}>{t(item)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field id={id + "-subcategory"} label={t("subcategory")} hint={filter ? undefined : t("subcategoryHint")}>
        <Select value={subcategory || "no-subcategory"} disabled={!subcategories.length}
          onValueChange={(value) => onChange(category, value === "no-subcategory" ? null : value)}>
          <SelectTrigger id={id + "-subcategory"} aria-describedby={filter ? undefined : id + "-subcategory-hint"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no-subcategory">{t(filter ? "allSubcategories" : "noSubcategory")}</SelectItem>
            {subcategories.map((item) => <SelectItem key={item} value={item}>{t(item)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {!filter && (category === "Utang" || category === "Piutang") && (
        <p className="text-sm text-muted-foreground sm:col-span-2">{t("debtCategoryHint")}</p>
      )}
    </>
  )
}
