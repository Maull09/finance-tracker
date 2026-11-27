import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { readFinancialHealth } from "@/lib/server/financial-health-queries"
import { healthInputSchema } from "@/lib/financial-health"
import { FinanceError } from "@/lib/finance-errors"
import { getCurrentMonth } from "@/lib/finance"
import { parseMoneyInput } from "@/lib/money-input"

export async function GET(request: Request) {
  return authenticatedResponse(async (connection) => {
    const params = new URL(request.url).searchParams
    const input = healthInputSchema.safeParse({
      month: params.get("month") ?? getCurrentMonth(),
      essentialExpense: params.has("essentialExpense") ? parseMoneyInput(params.get("essentialExpense"), 0, 2_147_483_647) ?? NaN : null,
      monthlyDebtPayment: params.has("monthlyDebtPayment") ? parseMoneyInput(params.get("monthlyDebtPayment"), 0, 2_147_483_647) ?? NaN : null,
    })
    if (!input.success) throw new FinanceError("invalidInput")
    return Response.json(await readFinancialHealth(connection, input.data))
  }, request)
}
