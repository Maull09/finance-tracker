import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { LanguageProvider } from "@/components/language-provider"
import { AiAvailabilityProvider } from "@/components/ai-availability-provider"
import { FinancialHealth } from "@/components/financial-health"
import { calculateFinancialHealth } from "@/lib/financial-health"

const { remote } = vi.hoisted(() => ({ remote: vi.fn() }))
vi.mock("@/lib/use-remote-data", () => ({ useRemoteData: remote }))
vi.mock("@/components/auth-provider", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }))

describe("financial health interface", () => {
  it("shows incomplete data, labelled inputs, formulas and automatic insight feedback", () => {
    const report = calculateFinancialHealth({ month: "2026-09", asOf: "2026-09-30", partial: false,
      months: [{ month: "2026-09", income: 1000000, expense: 500000, count: 2, transfers: 1, largestIncomeCategory: 1000000 }],
      liquidAssets: 1000000, totalAssets: 1000000, totalLiabilities: 0, recordedDebtPayments: 0,
      recurringExpense: 0, unpricedHoldings: 0, oldestPriceDate: null,
    }, { month: "2026-09", essentialExpense: null, monthlyDebtPayment: null })
    remote.mockReturnValue({ data: report, loading: false, refreshing: false, error: "", reload: vi.fn() })
    const markup = renderToStaticMarkup(
      <LanguageProvider>
        <AiAvailabilityProvider value={{ assistantEnabled: true, insightsEnabled: true }}>
          <FinancialHealth />
        </AiAvailabilityProvider>
      </LanguageProvider>,
    )
    expect(markup).toContain("Incomplete data")
    expect(markup).toContain('for="health-essential"')
    expect(markup).toContain('for="health-debt"')
    expect(markup).toContain('aria-describedby="health-essential-hint"')
    expect(markup).toContain("AI insights")
    expect(markup).toContain("Your analysis is waiting")
    expect(markup).toContain("Reanalyse")
    expect(markup).toContain("How the score is calculated")
    expect(markup).toContain("Transfers excluded from cash flow")
    expect(markup).not.toContain("NaN")
    expect(markup).not.toContain("Infinity")
  })
})
