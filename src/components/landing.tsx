"use client"

import Link from "next/link"
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronDown,
  ReceiptText,
  Target,
  Wallet,
} from "lucide-react"
import { useLanguage } from "./language-provider"
import { PublicHeader } from "./public-header"
import { ReportDistribution } from "./report-distribution"
import { Button } from "./ui/button"

export function Landing() {
  const { t } = useLanguage()
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="grid items-center gap-10 pb-12 pt-8 md:grid-cols-[1.1fr_1fr] md:gap-12 md:pb-16 md:pt-12">
          <div>
            <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.12] tracking-tight lg:text-5xl">
              {t("landingTitle")}
            </h1>
            <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("landingDescription")}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button
                asChild
                size="lg"
                className="min-h-12 bg-brand text-white hover:bg-brand-hover"
              >
                <Link href="/sign-up">{t("signUp")}</Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="min-h-12">
                <a href="#features">{t("landingExplore")}</a>
              </Button>
            </div>
          </div>
          <div className="min-w-0 rounded-xl border border-brand-border bg-brand-soft p-3 sm:p-4">
            <ReportDistribution
              title={t("landingExample")}
              description={t("landingExampleNote")}
              empty={t("noData")}
              data={[
                { name: t("landingFood"), value: 1500000, color: "var(--chart-1)" },
                {
                  name: t("landingTransport"),
                  value: 500000,
                  color: "var(--chart-3)",
                },
                { name: t("landingBills"), value: 1000000, color: "var(--chart-4)" },
              ]}
            />
          </div>
        </section>
        <section id="features" className="scroll-mt-8 border-t py-12 sm:py-16">
          <h2 className="max-w-xl text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
            {t("landingOverview")}
          </h2>
          <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">
            {t("landingOverviewBody")}
          </p>
          <div className="mt-8 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {[
              {
                icon: ReceiptText,
                title: "landingTracking",
                body: "landingTrackingBody",
              },
              {
                icon: ChartNoAxesCombined,
                title: "landingBudgeting",
                body: "landingBudgetingBody",
              },
              { icon: Target, title: "goalsTitle", body: "landingGoalsBody" },
              {
                icon: Wallet,
                title: "landingPlansTitle",
                body: "landingPlanningBody",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-brand-border bg-brand-soft text-brand-active">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-lg font-semibold leading-7">
                    {t(title)}
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                    {t(body)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded-xl border border-brand-border bg-brand-soft p-6 sm:p-8">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("landingStart")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("landingStartBody")}</p>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {["Account", "Transaction", "Plan"].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white"
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="font-semibold leading-6">
                    {t("landingStep" + step)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t("landingStep" + step + "Body")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <Button asChild variant="outline" className="mt-8">
            <Link href="/dashboard">
              {t("openWorkspace")}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
        <section className="py-12 sm:py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("landingQuestions")}
          </h2>
          <div className="mt-6 divide-y border-y">
            {["Bank", "Balance", "Planning", "Currency"].map((question) => (
              <details key={question} className="group">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden">
                  {t("landingFaq" + question)}
                  <ChevronDown
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <p className="max-w-2xl pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">
                  {t("landingFaq" + question + "Body")}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-5 py-6 text-sm text-muted-foreground sm:px-8">
        <span className="font-medium text-foreground">Finance Tracker</span>
        <p>{t("landingFooterNote")}</p>
      </footer>
    </div>
  )
}
