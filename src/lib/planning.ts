import { getNextMonthStart } from "./finance"
import type { PlannedCashflow, SimulationBalanceData } from "./planning-types"

export type Schedule = {
  id: number
  name: string
  type: string
  amount: number
  frequency: string
  startDate: string
  endDate?: string | null
  lastExecutedDate?: string | null
  recordedThroughDate?: string | null
  recordedDates?: string[]
  accountId: number
}
export type Occurrence = {
  scheduleId: number
  name: string
  type: string
  amount: number
  accountId: number
  date: string
}

export function scheduleOccurrences(
  schedule: Schedule,
  from: string,
  to: string,
): Occurrence[] {
  const start = new Date(schedule.startDate + "T00:00:00Z")
  const anchorDay = start.getUTCDate()
  const result: Occurrence[] = []
  const fromDate = new Date(from + "T00:00:00Z")
  let step =
    schedule.frequency === "weekly"
      ? Math.max(
          0,
          Math.floor((fromDate.getTime() - start.getTime()) / (7 * 86400000)),
        )
      : Math.max(
          0,
          (fromDate.getUTCFullYear() - start.getUTCFullYear()) * 12 +
            fromDate.getUTCMonth() -
            start.getUTCMonth(),
        )
  function dateAt(index: number) {
    if (schedule.frequency === "weekly")
      return new Date(start.getTime() + index * 7 * 86400000)
    const month = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1),
    )
    const lastDay = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
    ).getUTCDate()
    return new Date(
      Date.UTC(
        month.getUTCFullYear(),
        month.getUTCMonth(),
        Math.min(anchorDay, lastDay),
      ),
    )
  }
  let occurrence = dateAt(step)
  while (occurrence.toISOString().slice(0, 10) <= to) {
    const date = occurrence.toISOString().slice(0, 10)
    if (
      date >= from &&
      (!schedule.endDate || date <= schedule.endDate) &&
      (!schedule.recordedThroughDate || date > schedule.recordedThroughDate) &&
      !schedule.recordedDates?.includes(date)
    )
      result.push({
        scheduleId: schedule.id,
        name: schedule.name,
        type: schedule.type,
        amount: schedule.amount,
        accountId: schedule.accountId,
        date,
      })
    if (schedule.endDate && date >= schedule.endDate) break
    step++
    occurrence = dateAt(step)
  }
  return result
}

export function nextPendingOccurrence(schedule: Schedule, today: string) {
  const latestDate = [today, schedule.startDate, schedule.recordedThroughDate ?? "", ...(schedule.recordedDates ?? [])].sort().at(-1)!
  return scheduleOccurrences(schedule, schedule.startDate, getNextMonthStart(latestDate.slice(0, 7)))[0] ?? null
}

export function simulateCashflow(
  currentBalance: number,
  schedules: Schedule[],
  today: string,
  endDate: string,
  extraIncomes: PlannedCashflow[],
  extraExpenses: PlannedCashflow[],
) {
  const scheduled = schedules.flatMap((schedule) =>
    scheduleOccurrences(schedule, today, endDate),
  )
  const rows = []
  let month = today.slice(0, 7)
  let baseline = currentBalance
  let scenario = currentBalance
  while (month <= endDate.slice(0, 7)) {
    const occurrences = scheduled.filter((item) => item.date.startsWith(month))
    const income = occurrences
      .filter((item) => item.type === "income")
      .reduce((total, item) => total + item.amount, 0)
    const expense = occurrences
      .filter((item) => item.type === "expense")
      .reduce((total, item) => total + item.amount, 0)
    const extraIncome = extraIncomes
      .filter((item) => item.date.startsWith(month))
      .reduce((total, item) => total + item.amount, 0)
    const extraExpense = extraExpenses
      .filter((item) => item.date.startsWith(month))
      .reduce((total, item) => total + item.amount, 0)
    baseline += income - expense
    scenario += income + extraIncome - expense - extraExpense
    rows.push({
      month,
      income,
      expense,
      extraIncome,
      extraExpense,
      baseline,
      scenario,
      difference: scenario - baseline,
    })
    month = getNextMonthStart(month).slice(0, 7)
  }
  return {
    currentBalance,
    baseline,
    scenario,
    difference: scenario - baseline,
    scheduledIncome: scheduled
      .filter((item) => item.type === "income")
      .reduce((total, item) => total + item.amount, 0),
    scheduledExpense: scheduled
      .filter((item) => item.type === "expense")
      .reduce((total, item) => total + item.amount, 0),
    extraIncome: extraIncomes.reduce((total, item) => total + item.amount, 0),
    extraIncomeCount: extraIncomes.length,
    extraExpense: extraExpenses.reduce((total, item) => total + item.amount, 0),
    extraExpenseCount: extraExpenses.length,
    rows,
  }
}

export function projectNetWorth(
  cashflow: ReturnType<typeof simulateCashflow>,
  balance: SimulationBalanceData,
) {
  function atCash(projectedCash: number) {
    const knownNetWorth = balance.knownNetWorth + projectedCash - balance.currentBalance
    const grossWorth = balance.grossWorth + projectedCash - balance.currentBalance
    return {
      knownNetWorth,
      netWorth: balance.netWorth === null ? null : knownNetWorth,
      grossWorth,
    }
  }
  const projected = atCash(cashflow.scenario)
  return {
    ...cashflow,
    ...balance,
    projectedGrossWorth: projected.grossWorth,
    knownProjectedNetWorth: projected.knownNetWorth,
    projectedNetWorth: projected.netWorth,
    rows: cashflow.rows.map((row) => ({ ...row, ...atCash(row.scenario) })),
  }
}

export function fundBalance(entries: Array<{ kind: string; amount: number }>) {
  return entries.reduce(
    (total, entry) =>
      total + (entry.kind === "allocate" ? entry.amount : -entry.amount),
    0,
  )
}

export function monthlyFundSaving(
  target: number,
  allocated: number,
  targetDate: string,
  today: string,
) {
  const months =
    (Number(targetDate.slice(0, 4)) - Number(today.slice(0, 4))) * 12 +
    Number(targetDate.slice(5, 7)) -
    Number(today.slice(5, 7)) +
    1
  return Math.ceil(Math.max(0, target - allocated) / Math.max(1, months))
}
