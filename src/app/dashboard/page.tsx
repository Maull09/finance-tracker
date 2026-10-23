"use client"

import { useEffect, useState } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Menu,
  RefreshCw,
  ArrowRight,
} from "lucide-react"
import { AccountSummary } from "@/components/account-summary"
import { BudgetManager } from "@/components/budget-manager"
import { DebtManager } from "@/components/debt-manager"
import { GoalsManager } from "@/components/goals-manager"
import { PlanningManager } from "@/components/planning-manager"
import { InvestmentsManager } from "@/components/investments-manager"
import { NetWorth } from "@/components/net-worth"
import { FinancialCalendar } from "@/components/financial-calendar"
import { FinancialSimulation } from "@/components/financial-simulation"
import { PageInsights } from "@/components/page-insights"
import { FinancialHealth } from "@/components/financial-health"
import { SinkingFunds } from "@/components/sinking-funds"
import { ReportDistribution } from "@/components/report-distribution"
import { Sidebar, navigationItems } from "@/components/sidebar"
import { QuickGuide } from "@/components/quick-guide"
import { ThemeSelector } from "@/components/theme-selector"
import { useLanguage } from "@/components/language-provider"
import { TransactionList } from "@/components/transaction-list"
import { TransactionForm } from "@/components/transaction-form"
import { AddAccountForm } from "@/components/accounts-form"
import { AiAssistant } from "@/components/ai-assistant"
import {
  EmptyState,
  ErrorNotice,
  Field,
  LoadingState,
  PageHeading,
} from "@/components/feedback"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { chartTooltipStyle, chartTooltipItemStyle } from "@/lib/chart-theme"
import { getCurrentMonth } from "@/lib/finance"
import { useRemoteData } from "@/lib/use-remote-data"
import type { Account, DashboardData } from "@/lib/types"

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--negative)",
  "var(--chart-5)",
  "var(--chart-6)",
]

export default function FinanceTracker() {
  const { locale, t } = useLanguage()
  const [tab, setTab] = useState("dashboard")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  useEffect(() => {
    const navigate = () => {
      const next = window.location.hash.slice(1).split("?")[0]
      if (next === "main-content") return
      setTab(
        navigationItems.some((item) => item.key === next) ? next : "dashboard",
      )
      window.scrollTo({ top: 0 })
      document.getElementById("main-content")?.focus({ preventScroll: true })
    }
    navigate()
    window.addEventListener("hashchange", navigate)
    return () => window.removeEventListener("hashchange", navigate)
  }, [])
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById("main-content")?.focus()
        }}
        className="sr-only z-[60] rounded bg-card p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("skipToContent")}
      </a>
      <Sidebar
        activeTab={tab}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-card/95 px-4 backdrop-blur-sm sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label={t("openMenu")}
              aria-expanded={sidebarOpen}
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-semibold">{t(tab)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="mr-3 hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
              <Calendar className="h-4 w-4" />
              {new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
                month: "long",
                year: "numeric",
                timeZone: "Asia/Jakarta",
              }).format(new Date())}
            </span>
            <QuickGuide />
            <ThemeSelector />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1440px] p-4 outline-none sm:p-7 lg:p-8"
        >
          {tab === "dashboard" && <Dashboard />}
          {tab === "transactions" && <TransactionList />}
          {tab === "ai" && <AiAssistant />}
          {tab === "budget" && <BudgetManager />}
          {tab === "goals" && <GoalsManager />}
          {tab === "debts" && <DebtManager />}
          {tab === "reports" && <Reports />}
          {tab === "financialHealth" && <FinancialHealth />}
          {tab === "planning" && <PlanningManager />}
          {tab === "investments" && <InvestmentsManager />}
          {tab === "netWorth" && <NetWorth />}
          {tab === "calendar" && <FinancialCalendar />}
          {tab === "simulation" && <FinancialSimulation />}
          {tab === "funds" && <SinkingFunds />}
        </main>
      </div>
    </div>
  )
}
function Dashboard() {
  const { locale, t, formatCurrency } = useLanguage()
  const records = useRemoteData<DashboardData>(
    "/api/dashboard?locale=" + locale,
  )
  const data = records.data
  const accounts = useRemoteData<Account[]>("/api/accounts")
  return (
    <div className="space-y-6">
      <PageHeading
        title={t("moneyAtAGlance")}
        description={t("dashboardDescriptionShort")}
      >
        <Button
          variant="outline"
          onClick={records.reload}
          disabled={records.loading || records.refreshing}
        >
          <RefreshCw
            className={
              "h-4 w-4 " +
              (records.loading || records.refreshing ? "animate-spin" : "")
            }
          />
          {t(records.loading || records.refreshing ? "refreshing" : "refresh")}
        </Button>
        {accounts.data?.length ? (
          <TransactionForm accounts={accounts.data} onSaved={() => {}} />
        ) : !accounts.loading && !accounts.error ? (
          <AddAccountForm />
        ) : null}
      </PageHeading>
      <PageInsights context={{ page: "dashboard" }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      <ErrorNotice message={records.error} onRetry={records.reload} />
      {records.refreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {records.loading ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <section
              aria-label={t("overview")}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
                <div className="bg-brand-soft p-5 sm:p-6">
                  <p className="text-sm text-brand-active">
                    {t("totalBalance")}
                  </p>
                  <p
                    className={
                      "mt-3 break-words text-3xl font-semibold tracking-tight tabular-nums " +
                      (data.runningBalance < 0
                        ? "text-negative"
                        : "text-foreground")
                    }
                  >
                    {formatCurrency(data.runningBalance)}
                  </p>
                  <p className="mt-3 text-xs text-brand-active">
                    {t("accountBalanceDescription")}
                  </p>
                </div>
                <Metric
                  label={t("monthlyIncome")}
                  amount={formatCurrency(data.income)}
                  icon={<ArrowDownLeft className="h-4 w-4" />}
                  tone="text-positive"
                />
                <Metric
                  label={t("monthlyExpense")}
                  amount={formatCurrency(data.expense)}
                  icon={<ArrowUpRight className="h-4 w-4" />}
                  tone="text-negative"
                />
                <Metric
                  label={t("monthlySavingRate")}
                  amount={
                    data.income > 0
                      ? new Intl.NumberFormat(
                          locale === "id" ? "id-ID" : "en-US",
                          { style: "percent", maximumFractionDigits: 1 },
                        ).format(data.savingRate / 100)
                      : t("notAvailable")
                  }
                  hint={t(
                    data.income > 0
                      ? "savingsRateHint"
                      : "savingsRateUnavailable",
                  )}
                  tone={
                    data.savingRate < 0 ? "text-negative" : "text-foreground"
                  }
                />
              </div>
            </section>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href="#transactions">{t("viewTransactions")}</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#budget">{t("viewBudget")}</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#netWorth">{t("viewNetWorth")}</a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <a href="#financialHealth">{t("financialHealth")}</a>
              </Button>
            </div>
            <section
              aria-labelledby="daily-analysis-heading"
              className="grid gap-5 xl:grid-cols-5"
            >
              <Card className="xl:col-span-2">
                <CardHeader>
                  <CardTitle id="daily-analysis-heading">
                    {t("dailyAnalysis")}
                  </CardTitle>
                  <CardDescription>{t("dailyAnalysisDescription")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid divide-y border-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                      <dt className="text-sm text-muted-foreground">
                        {t("todayIncome")}
                      </dt>
                      <dd className="mt-2 break-words text-lg font-semibold tabular-nums text-positive">
                        {formatCurrency(data.today.income)}
                      </dd>
                    </div>
                    <div className="py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                      <dt className="text-sm text-muted-foreground">
                        {t("todayExpense")}
                      </dt>
                      <dd className="mt-2 break-words text-lg font-semibold tabular-nums text-negative">
                        {formatCurrency(data.today.expense)}
                      </dd>
                    </div>
                    <div className="py-4 sm:px-4 sm:first:pl-0 sm:last:pr-0">
                      <dt className="text-sm text-muted-foreground">
                        {t("netToday")}
                      </dt>
                      <dd
                        className={
                          "mt-2 break-words text-lg font-semibold tabular-nums " +
                          (data.today.net < 0
                            ? "text-negative"
                            : "text-positive")
                        }
                      >
                        {formatCurrency(data.today.net)}
                      </dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
              <Card className="xl:col-span-3">
                <CardHeader>
                  <CardTitle>{t("dailyCashFlow")}</CardTitle>
                  <CardDescription>
                    {t("dailyCashFlowDescription")}
                  </CardDescription>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-positive" />
                      {t("income")}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-negative" />
                      {t("expenses")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.dailyData} accessibilityLayer>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        tick={{ fill: "var(--muted-foreground)" }}
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tick={{ fill: "var(--muted-foreground)" }}
                        width={48}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          value / 1000000 + " " + t("shortMillion")
                        }
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        itemStyle={chartTooltipItemStyle}
                        cursor={{ fill: "var(--muted)", stroke: "var(--border)" }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="income"
                        fill="var(--positive)"
                        name={t("income")}
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="expense"
                        fill="var(--negative)"
                        name={t("expenses")}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </section>
            <Card>
              <CardHeader>
                <CardTitle>{t("spendingSignals")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AnalysisMetric
                  label={t("averageDailyExpense")}
                  value={formatCurrency(data.dailyAverageExpense)}
                  detail={t("averageDailyExpenseHint")}
                />
                <AnalysisMetric
                  label={t("highestExpenseDay")}
                  value={
                    data.highestExpenseDay
                      ? formatCurrency(data.highestExpenseDay.amount)
                      : t("notAvailable")
                  }
                  detail={
                    data.highestExpenseDay?.label ?? t("highestExpenseDayHint")
                  }
                />
                <AnalysisMetric
                  label={t("topExpenseCategory")}
                  value={
                    data.topExpenseCategory
                      ? t(data.topExpenseCategory.name)
                      : t("notAvailable")
                  }
                  detail={
                    data.topExpenseCategory
                      ? formatCurrency(data.topExpenseCategory.amount)
                      : t("topExpenseCategoryHint")
                  }
                />
                <AnalysisMetric
                  label={t("spendingVsLastMonth")}
                  value={
                    data.spendingChange
                      ? `${data.spendingChange.percent > 0 ? "+" : ""}${data.spendingChange.percent}%`
                      : t("notAvailable")
                  }
                  detail={
                    data.spendingChange
                      ? t(
                          data.spendingChange.amount > 0
                            ? "spendingHigher"
                            : "spendingLower",
                          {
                            amount: formatCurrency(
                              Math.abs(data.spendingChange.amount),
                            ),
                          },
                        )
                      : t("spendingVsLastMonthHint")
                  }
                  tone={
                    data.spendingChange && data.spendingChange.amount > 0
                      ? "text-negative"
                      : data.spendingChange && data.spendingChange.amount < 0
                        ? "text-positive"
                        : undefined
                  }
                />
              </CardContent>
            </Card>
            <AccountSummary />
            <div className="grid gap-5 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>{t("cashFlow")}</CardTitle>
                  <CardDescription>{t("cashFlowDescription")}</CardDescription>
                  <div className="mt-3 flex gap-4 text-xs">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-positive" />
                      {t("income")}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-negative" />
                      {t("expenses")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.monthlyData} accessibilityLayer>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        tick={{ fill: "var(--muted-foreground)" }}
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tick={{ fill: "var(--muted-foreground)" }}
                        width={48}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          value / 1000000 + " " + t("shortMillion")
                        }
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        itemStyle={chartTooltipItemStyle}
                        cursor={{ fill: "var(--muted)", stroke: "var(--border)" }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="income"
                        fill="var(--positive)"
                        name={t("income")}
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        isAnimationActive={false}
                        dataKey="expense"
                        fill="var(--negative)"
                        name={t("expenses")}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t("balanceProgress")}</CardTitle>
                  <CardDescription>
                    {t("balanceProgressDescription")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={282}>
                    <AreaChart data={data.balanceHistory} accessibilityLayer>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        tick={{ fill: "var(--muted-foreground)" }}
                        dataKey="month"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                      />
                      <YAxis
                        tick={{ fill: "var(--muted-foreground)" }}
                        width={48}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) =>
                          value / 1000000 + " " + t("shortMillion")
                        }
                      />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        itemStyle={chartTooltipItemStyle}
                        cursor={{ fill: "var(--muted)", stroke: "var(--border)" }}
                        formatter={(value: number) => formatCurrency(value)}
                      />
                      <Area
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="balance"
                        stroke="var(--chart-1)"
                        fill="var(--chart-1)"
                        fillOpacity={0.1}
                        name={t("balance")}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            <div className="flex justify-end">
              <Button asChild variant="link">
                <a href="#reports">
                  {t("exploreReports")}
                  <ArrowRight aria-hidden="true" />
                </a>
              </Button>
            </div>
          </>
        )
      )}
    </div>
  )
}
function Metric({
  label,
  amount,
  icon,
  tone,
  hint,
}: {
  label: string
  amount: string
  icon?: React.ReactNode
  tone: string
  hint?: string
}) {
  return (
    <div className="border-border p-5 sm:border-l sm:p-6">
      <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        {label}
        {icon}
      </p>
      <p
        className={
          "mt-3 break-words text-2xl font-semibold tracking-tight tabular-nums " +
          tone
        }
      >
        {amount}
      </p>
      {hint && (
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

function AnalysisMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone?: string
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={
          "mt-2 break-words text-lg font-semibold tabular-nums " +
          (tone ?? "text-foreground")
        }
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {detail}
      </p>
    </div>
  )
}

function Reports() {
  const { locale, formatCurrency, t } = useLanguage()
  const [month, setMonth] = useState(getCurrentMonth())
  const records = useRemoteData<DashboardData>(
    "/api/dashboard?month=" + month + "&locale=" + locale,
  )
  const data = records.data
  const expenses = Object.entries(data?.expenseByCategory ?? {}).map(
    ([name, value], index) => ({
      name: t(name),
      value,
      color: chartColors[index % chartColors.length],
    }),
  )
  const incomes = Object.entries(data?.incomeBySource ?? {}).map(
    ([name, value], index) => ({
      name: t(name),
      value,
      color: chartColors[index % chartColors.length],
    }),
  )
  return (
    <div className="space-y-6">
      <PageHeading
        title={t("reportsTitle")}
        description={t("reportsDescription")}
      >
        <Field id="report-month" label={t("period")}>
          <Input
            id="report-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) setMonth(event.target.value)
            }}
          />
        </Field>
      </PageHeading>
      <PageInsights context={{ page: "reports", month }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      {records.error ? (
        <ErrorNotice message={records.error} onRetry={records.reload} />
      ) : records.loading ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <div className="grid gap-5 xl:grid-cols-2">
              <ReportDistribution
                title={t("expensesByCategory")}
                description={t("expensesByCategoryDescription")}
                data={expenses}
                empty={t("noExpenseData")}
              />
              <ReportDistribution
                title={t("incomeSources")}
                description={t("incomeSourcesDescription")}
                data={incomes}
                empty={t("noIncomeData")}
              />
            </div>
            {data.insights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("changeInsights")}</CardTitle>
                  <CardDescription>
                    {t("previousMonthComparison")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.insights.map((insight) => (
                    <p
                      key={insight}
                      className="rounded-lg border-l-4 border-warning bg-warning-soft p-3 text-sm text-warning"
                    >
                      {insight}
                    </p>
                  ))}
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle>{t("expenseBreakdown")}</CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <EmptyState
                    title={t("noData")}
                    description={t("noExpenseData")}
                  />
                ) : (
                  expenses.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 border-b py-3 last:border-0"
                    >
                      <span className="flex items-center gap-3 text-sm">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.name}
                      </span>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(item.value)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )
      )}
    </div>
  )
}
