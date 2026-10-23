"use client"

import { PageInsights } from "./page-insights"
import { MonthPicker } from "./month-picker"
import { RecordOccurrence } from "./record-occurrence"
import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useLanguage } from "./language-provider"
import {
  EmptyState,
  ErrorNotice,
  Field,
  LoadingState,
  PageHeading,
} from "./feedback"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { useRemoteData } from "@/lib/use-remote-data"
import { getCurrentMonth, getToday, isMonth } from "@/lib/finance"
import type { CalendarData } from "@/lib/planning-types"

const eventColors: Record<string, string> = {
  income: "bg-brand-soft text-brand-active",
  expense: "bg-rose-50 text-rose-900",
  transfer: "bg-sky-50 text-sky-900",
  debtDue: "bg-amber-50 text-amber-900",
  receivableDue: "bg-brand-soft text-brand-active",
  fundDue: "bg-slate-100 text-slate-900",
}

export function FinancialCalendar() {
  const { t, locale, formatCurrency, formatDate, formatMonth } = useLanguage()
  const [month, setMonth] = useState(getCurrentMonth())
  const [selectedDate, setSelectedDate] = useState("")
  const records = useRemoteData<CalendarData>("/api/calendar?month=" + month)
  const events = records.data?.events ?? []
  function changeMonth(value: string) {
    if (isMonth(value) && value >= "1900-01" && value <= "2100-12") {
      setMonth(value)
      setSelectedDate("")
    }
  }
  function moveMonth(offset: number) {
    const [year, number] = month.split("-").map(Number)
    changeMonth(
      new Date(Date.UTC(year, number - 1 + offset, 1))
        .toISOString()
        .slice(0, 7),
    )
  }
  const firstDay = new Date(month + "-01T00:00:00Z")
  const offset = (firstDay.getUTCDay() + 6) % 7
  const days = new Date(
    Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const cells = Array.from(
    { length: Math.ceil((offset + days) / 7) * 7 },
    (_, index) =>
      index >= offset && index < offset + days
        ? month + "-" + String(index - offset + 1).padStart(2, "0")
        : null,
  )
  const weekday = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "short",
    timeZone: "UTC",
  })
  const agenda = selectedDate
    ? events.filter((event) => event.date === selectedDate)
    : events

  return (
    <div className="space-y-6">
      <PageHeading title={t("calendar")} description={t("calendarDescription")}>
        <Button
          variant="outline"
          onClick={() => changeMonth(getCurrentMonth())}
        >
          {t("thisMonth")}
        </Button>
      </PageHeading>
      <PageInsights context={{ page: "calendar", month }} ready={Boolean(records.data) && !records.loading && !records.refreshing && !records.error} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field id="calendar-month" label={t("period")}>
          <MonthPicker
            id="calendar-month"
            min="1900-01"
            max="2100-12"
            value={month}
            onChange={changeMonth}
          />
        </Field>
        <div className="md:hidden">
          <Field
            id="calendar-day"
            label={t("date")}
            hint={t("calendarDayHint")}
          >
            <Input
              id="calendar-day"
              type="date"
              value={selectedDate}
              min={month + "-01"}
              max={month + "-" + String(days).padStart(2, "0")}
              aria-describedby="calendar-day-hint"
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            aria-label={t("monthPrevious")}
            disabled={month <= "1900-01"}
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            aria-label={t("monthNext")}
            disabled={month >= "2100-12"}
            onClick={() => moveMonth(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {t("calendarHint")}
      </p>
      {records.refreshing && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("refreshing")}
        </p>
      )}
      {records.error ? (
        <ErrorNotice message={records.error} onRetry={records.reload} />
      ) : records.loading ? (
        <LoadingState />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">{formatMonth(month)}</caption>
              <thead>
                <tr>
                  {Array.from({ length: 7 }, (_, index) => (
                    <th
                      scope="col"
                      key={index}
                      className="border-b bg-muted/50 p-3 text-left font-medium text-muted-foreground"
                    >
                      {weekday.format(new Date(Date.UTC(2026, 5, 1 + index)))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: cells.length / 7 }, (_, row) => (
                  <tr key={row}>
                    {cells.slice(row * 7, row * 7 + 7).map((date, column) => (
                      <td
                        key={column}
                        className="border-b border-r p-0 align-top last:border-r-0"
                      >
                        {date && (
                          <button
                            type="button"
                            aria-label={
                              t("eventsOn", { date: formatDate(date) }) +
                              ": " +
                              events.filter((event) => event.date === date)
                                .length
                            }
                            aria-pressed={selectedDate === date}
                            onClick={() => setSelectedDate(date)}
                            className={
                              "block min-h-28 w-full space-y-2 p-2 text-left hover:bg-muted/50 " +
                              (selectedDate === date
                                ? "bg-brand-soft ring-2 ring-inset ring-brand"
                                : "")
                            }
                          >
                            <span
                              className={
                                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
                                (date === getToday()
                                  ? "bg-brand text-white"
                                  : "")
                              }
                            >
                              {Number(date.slice(-2))}
                            </span>
                            {events
                              .filter((event) => event.date === date)
                              .slice(0, 2)
                              .map((event) => (
                                <span
                                  key={event.id}
                                  className={
                                    "block truncate rounded px-1 py-1 text-xs " +
                                    eventColors[event.type]
                                  }
                                  title={event.name}
                                >
                                  {event.name}
                                </span>
                              ))}
                            {events.filter((event) => event.date === date)
                              .length > 2 && (
                              <span className="block text-xs text-muted-foreground">
                                +
                                {events.filter((event) => event.date === date)
                                  .length - 2}
                              </span>
                            )}
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                {selectedDate
                  ? t("eventsOn", { date: formatDate(selectedDate) })
                  : t("agenda")}
              </h2>
              {selectedDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedDate("")}
                >
                  {t("resetFilters")}
                </Button>
              )}
            </div>
            {agenda.length === 0 ? (
              <EmptyState
                title={t(selectedDate ? "noEventsOnDay" : "noCalendarEvents")}
                description={t("calendarHint")}
              />
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-white">
                {agenda.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-4"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{event.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(event.date)}
                      </p>
                      <span
                        className={
                          "mt-2 inline-block rounded px-2 py-1 text-xs " +
                          eventColors[event.type]
                        }
                      >
                        {t(event.type)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">
                        {formatCurrency(event.amount)}
                      </span>
                      {event.source === "recurring" && event.scheduleId && (
                        <RecordOccurrence occurrence={{ ...event, scheduleId: event.scheduleId }} accountName={event.accountName ?? undefined} />
                      )}
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={
                            "#" +
                            (event.source === "recurring"
                              ? "planning"
                              : event.source)
                          }
                        >
                          {t("calendarGoTo")}
                        </a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
