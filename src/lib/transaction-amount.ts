export function parseTransactionAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  const text = String(value).trim()
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null
  const amount = Number(text.replace(",", "."))
  return Number.isFinite(amount) && amount > 0 && amount <= 2_147_483_647 ? amount : null
}
