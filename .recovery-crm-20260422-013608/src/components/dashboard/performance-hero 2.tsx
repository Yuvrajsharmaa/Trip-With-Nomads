"use client"

import { TrendingUp } from "lucide-react"
import type { CRMRole } from "@/types/roles"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

interface PerformanceHeroProps {
  userName: string
  role: CRMRole
  wonThisWeek: number
}

const ROLE_LABELS: Record<CRMRole, string> = {
  admin: "Admin",
  operations_manager: "Operations Manager",
  sales_manager: "Sales Manager",
  sales_agent: "Sales Agent",
  finance_manager: "Finance Manager",
  finance_agent: "Finance Agent",
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

export function PerformanceHero({ userName, role, wonThisWeek }: PerformanceHeroProps) {
  const today = format(new Date(), "EEEE, d MMMM yyyy")
  const firstName = userName.split(" ")[0]
  const roleLabel = ROLE_LABELS[role] || role
  const greeting = getGreeting()

  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {today}
        </p>
        <h1 className="text-3xl font-black tracking-tight text-foreground leading-tight">
          {greeting}, {firstName}
        </h1>
        <div className="flex items-center gap-2 pt-0.5">
          <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {roleLabel}
          </span>
        </div>
      </div>

      {wonThisWeek > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30 px-5 py-3 shrink-0">
          <div className="size-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
            <TrendingUp className="size-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/70">
              Won This Week
            </p>
            <p className={cn(
              "font-black text-emerald-700 leading-none",
              wonThisWeek >= 10 ? "text-2xl" : "text-3xl"
            )}>
              {wonThisWeek}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
