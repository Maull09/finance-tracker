export function parseMoneyInput(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  const text = String(value).trim()
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(text)) return null
  const amount = Number(text.replace(",", "."))
  return Number.isFinite(amount) && amount >= minimum && amount <= maximum
    ? amount
    : null
}
