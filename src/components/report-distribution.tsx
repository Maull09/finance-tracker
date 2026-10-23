"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { useLanguage } from "./language-provider"
import { chartTooltipStyle, chartTooltipItemStyle } from "@/lib/chart-theme"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card"

export type DistributionItem = {
  name: string
  value: number
  color: string
}

export function ReportDistribution({
  title,
  description,
  data,
  empty,
}: {
  title: string
  description: string
  data: DistributionItem[]
  empty: string
}) {
  const { locale, t, formatCurrency } = useLanguage()
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
            {empty}
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart accessibilityLayer>
                <Pie
                  isAnimationActive={false}
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={85}
                  paddingAngle={2}
                  stroke="var(--card)"
                >
                  {data.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} itemStyle={chartTooltipItemStyle} formatter={(value: number) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <table className="mt-5 w-full text-xs sm:text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="pb-2 font-medium">
                    {t("category")}
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    {t("amount")}
                  </th>
                  <th scope="col" className="pb-2 text-right font-medium">
                    {t("share")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((item) => (
                  <tr key={item.name} className="border-b last:border-0">
                    <td className="py-2.5 pr-2 sm:pr-3">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        {item.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right font-medium tabular-nums">
                      {formatCurrency(item.value)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pl-2 text-right tabular-nums text-muted-foreground sm:pl-3">
                      {new Intl.NumberFormat(
                        locale === "id" ? "id-ID" : "en-US",
                        { style: "percent", maximumFractionDigits: 1 },
                      ).format(total === 0 ? 0 : item.value / total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  )
}
