import { z } from "zod"
import { parseMoneyInput } from "./money-input"

export const nonnegativeMoneySchema = z.number().min(0).max(2_147_483_647)
  .refine((value) => parseMoneyInput(value, 0, 2_147_483_647) !== null)

export const positiveMoneySchema = nonnegativeMoneySchema.refine((value) => value > 0)
