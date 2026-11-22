import { parseMoneyInput } from "./money-input"

export function parseTransactionAmount(value: unknown): number | null {
  return parseMoneyInput(value, 0.01, 2_147_483_647)
}
