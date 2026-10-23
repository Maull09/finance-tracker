"use client"

import { BookOpen, CircleHelp } from "lucide-react"
import { useLanguage } from "./language-provider"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog"

export function QuickGuide() {
  const { t } = useLanguage()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <CircleHelp className="h-4 w-4" />
          <span className="hidden sm:inline">{t("help")}</span>
          <span className="sr-only sm:hidden">{t("help")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-brand-active" />
            {t("help")}
          </DialogTitle>
          <DialogDescription>{t("helpDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {[
            "Accounts",
            "Manage",
            "Transactions",
            "Budget",
            "Goals",
            "Planning",
            "Reconcile",
            "Investments",
            "NetWorth",
            "Simulation",
            "Calendar",
            "Funds",
          ].map((topic) => (
            <section key={topic}>
              <h2 className="text-sm font-semibold">{t("help" + topic)}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {t("help" + topic + "Body")}
              </p>
            </section>
          ))}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>{t("done")}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
