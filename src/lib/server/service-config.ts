import { FinanceError } from "@/lib/finance-errors"

export function redisEnabled() {
  return process.env.REDIS_ENABLED !== "false"
}

export function ollamaEnabled() {
  return process.env.OLLAMA_ENABLED !== "false"
}

export function requireOllamaEnabled() {
  if (!ollamaEnabled()) throw new FinanceError("aiDisabled", 503)
}
