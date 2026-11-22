import { NextRequest, NextResponse } from "next/server"

import { authenticatedResponse } from "@/lib/server/authenticated-response"
import { readDashboardLedger } from "@/lib/server/dashboard-queries"
import {
  getCategoryInsight,
  getPeriodRange,
  getPreviousPeriod,
} from "@/lib/calculations"
import {
  formatMonth,
  getCurrentMonth,
  getMonthStart,
  getRecentMonths,
  getToday,
  isMonth,
} from "@/lib/finance"

export async function GET(request: NextRequest) {
  return authenticatedResponse(async (db) => {
    const locale =
      new URL(request.url).searchParams.get("locale") === "en" ? "en" : "id"
    const requestedMonth = new URL(request.url).searchParams.get("month")
    const currentMonth = isMonth(requestedMonth)
      ? requestedMonth
      : getCurrentMonth()
    const period = getPeriodRange(currentMonth)
    const today = getToday()
    const recentDays = getRecentDays(today, 7)
    const months = getRecentMonths(6)
    const firstMonthStart = getMonthStart(months[0])
    const previousPeriod = getPeriodRange(getPreviousPeriod(currentMonth))
    const {
      startingBalance,
      transactions: allTransactions,
      trades,
      cashBalance,
      openingChange,
    } = await readDashboardLedger(db, {
      historyStart: firstMonthStart,
      historyEnd: getPeriodRange(months[months.length - 1]).end,
      previousStart: previousPeriod.start,
      periodEnd: period.end,
      recentStart: recentDays[0],
      today,
    })
    const monthlyTransactions = allTransactions.filter(
      (transaction) =>
        transaction.date >= period.start && transaction.date < period.end,
    )
    const income = totalFor(monthlyTransactions, "income")
    const expense = totalFor(monthlyTransactions, "expense")
    const todayTransactions = allTransactions.filter(
      (transaction) => transaction.date === today,
    )
    const dailyData = recentDays.map((date) => {
      const dayTransactions = allTransactions.filter(
        (transaction) => transaction.date === date,
      )

      return {
        date,
        label: formatDay(date, locale),
        income: totalFor(dayTransactions, "income"),
        expense: totalFor(dayTransactions, "expense"),
      }
    })
    const runningBalance = cashBalance
    let historicalBalance = startingBalance + openingChange

    const monthlyData = months.map((month) => {
      const monthTransactions = allTransactions.filter((transaction) =>
        transaction.date.startsWith(month),
      )
      const monthIncome = totalFor(monthTransactions, "income")
      const monthExpense = totalFor(monthTransactions, "expense")
      historicalBalance +=
        monthIncome -
        monthExpense +
        trades
          .filter((trade) => trade.date.startsWith(month))
          .reduce((total, trade) => total + trade.cashChange, 0)

      return {
        month: formatMonth(month, locale),
        income: monthIncome,
        expense: monthExpense,
        balance: historicalBalance,
      }
    })

    const expenseByCategory = totalByCategory(monthlyTransactions, "expense")
    const dailyExpenses = totalByDate(monthlyTransactions, "expense")
    const [highestExpenseDate, highestExpenseAmount] = Object.entries(
      dailyExpenses,
    ).reduce<[string | null, number]>(
      (highest, [date, amount]) =>
        amount > highest[1] ? [date, amount] : highest,
      [null, 0],
    )
    const [topExpenseCategoryName, topExpenseCategoryAmount] = Object.entries(
      expenseByCategory,
    ).reduce<[string | null, number]>(
      (topCategory, [category, amount]) =>
        amount > topCategory[1] ? [category, amount] : topCategory,
      [null, 0],
    )
    const previousByCategory = totalByCategory(
      allTransactions.filter(
        (transaction) =>
          transaction.date >= previousPeriod.start &&
          transaction.date < previousPeriod.end,
      ),
      "expense",
    )
    const previousExpenseToDate = totalFor(
      allTransactions.filter(
        (transaction) =>
          transaction.date >= previousPeriod.start &&
          transaction.date <= getMatchingPreviousDate(today, previousPeriod.start),
      ),
      "expense",
    )
    const spendingChange =
      currentMonth === getCurrentMonth() && previousExpenseToDate > 0
        ? {
            amount: expense - previousExpenseToDate,
            percent:
              Math.round(
                ((expense - previousExpenseToDate) / previousExpenseToDate) *
                  1000,
              ) / 10,
          }
        : null
    const insights = Object.entries(expenseByCategory)
      .map(([category, amount]) =>
        getCategoryInsight(
          category,
          amount,
          previousByCategory[category] ?? 0,
          locale,
        ),
      )
      .filter((insight): insight is string => insight !== null)

    return NextResponse.json({
      income,
      expense,
      runningBalance,
      savingRate:
        income === 0
          ? 0
          : Math.round(((income - expense) / income) * 1000) / 10,
      monthlyData,
      balanceHistory: monthlyData.map(({ month, balance }) => ({
        month,
        balance,
      })),
      dailyData,
      today: {
        income: totalFor(todayTransactions, "income"),
        expense: totalFor(todayTransactions, "expense"),
        net:
          totalFor(todayTransactions, "income") -
          totalFor(todayTransactions, "expense"),
      },
      dailyAverageExpense:
        currentMonth === getCurrentMonth()
          ? expense / Number(today.slice(-2))
          : 0,
      highestExpenseDay:
        highestExpenseDate === null
          ? null
          : {
              label: formatDay(highestExpenseDate, locale),
              amount: highestExpenseAmount,
            },
      topExpenseCategory:
        topExpenseCategoryName === null
          ? null
          : { name: topExpenseCategoryName, amount: topExpenseCategoryAmount },
      spendingChange,
      expenseByCategory,
      incomeBySource: totalByCategory(monthlyTransactions, "income"),
      insights,
    })
  }, request)
}

function getRecentDays(today: string, count: number) {
  const currentDay = new Date(`${today}T00:00:00Z`)

  return Array.from({ length: count }, (_, index) => {
    const day = new Date(currentDay)
    day.setUTCDate(currentDay.getUTCDate() - (count - index - 1))
    return day.toISOString().slice(0, 10)
  })
}

function formatDay(date: string, locale: "en" | "id") {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`))
}

function getMatchingPreviousDate(today: string, previousPeriodStart: string) {
  const currentDay = Number(today.slice(-2))
  const previousMonthEnd = new Date(`${previousPeriodStart}T00:00:00Z`)
  previousMonthEnd.setUTCMonth(previousMonthEnd.getUTCMonth() + 1)
  previousMonthEnd.setUTCDate(0)

  return `${previousPeriodStart.slice(0, 7)}-${String(
    Math.min(currentDay, previousMonthEnd.getUTCDate()),
  ).padStart(2, "0")}`
}

function totalFor(
  rows: Array<{ type: "income" | "expense" | "transfer"; amount: number }>,
  type: "income" | "expense",
) {
  return rows.reduce(
    (total, transaction) =>
      transaction.type === type ? total + Math.round(transaction.amount * 100) : total,
    0,
  ) / 100
}

function totalByCategory(
  rows: Array<{
    type: "income" | "expense" | "transfer"
    category: string
    amount: number
  }>,
  type: "income" | "expense",
) {
  return rows.reduce<Record<string, number>>((totals, transaction) => {
    if (transaction.type === type)
      totals[transaction.category] =
        (Math.round((totals[transaction.category] ?? 0) * 100) + Math.round(transaction.amount * 100)) / 100
    return totals
  }, {})
}

function totalByDate(
  rows: Array<{
    type: "income" | "expense" | "transfer"
    date: string
    amount: number
  }>,
  type: "income" | "expense",
) {
  return rows.reduce<Record<string, number>>((totals, transaction) => {
    if (transaction.type === type)
      totals[transaction.date] = (Math.round((totals[transaction.date] ?? 0) * 100) + Math.round(transaction.amount * 100)) / 100
    return totals
  }, {})
}
