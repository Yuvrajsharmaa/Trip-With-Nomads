"use client"

import * as React from "react"
import { PieChart, Pie, Cell } from "recharts"
import { format } from "date-fns"
import { toast } from "sonner"
import { AlertTriangle, CheckCircle2, Clock, Target } from "lucide-react"

import type {
  ClosedLeadsMetrics,
  ClosedLeadsRange,
  ManagerDashboardInsights,
} from "@/types/dashboard"
import { fetchClosedLeadsMetrics } from "@/lib/actions/crm-core"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { KpiStatCard } from "@/components/dashboard/widgets/kpi-stat-card"
import { SalesPipelineCard } from "@/components/dashboard/widgets/sales-pipeline-card"
import { SalesAnalyticsCard } from "@/components/dashboard/widgets/sales-analytics-card"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"

interface ManagerOverviewProps {
  insights: ManagerDashboardInsights
  initialClosedLeadsMetrics: ClosedLeadsMetrics
}

const CLOSED_RANGE_LABELS: Record<ClosedLeadsRange, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "1w": "1 Week",
  "1m": "1 Month",
  "3m": "3 Months",
  "6m": "6 Months",
  "1y": "1 Year",
  custom: "Custom",
}

const SOURCE_STOPS = [
  "color-mix(in oklch, var(--foreground) 94%, var(--background))",
  "color-mix(in oklch, var(--foreground) 78%, var(--background))",
  "color-mix(in oklch, var(--foreground) 66%, var(--background))",
  "color-mix(in oklch, var(--foreground) 54%, var(--background))",
  "color-mix(in oklch, var(--foreground) 42%, var(--background))",
  "color-mix(in oklch, var(--foreground) 30%, var(--background))",
]

type LocalDateRange = {
  from?: Date
  to?: Date
}

function shortLabel(source: string) {
  return source.replace(/_/g, " ").split(" ")[0]?.toUpperCase().slice(0, 8) || "OTHER"
}

function LeadSourcesCard({ leadsBySource }: { leadsBySource: Record<string, number> }) {
  const sorted = Object.entries(leadsBySource)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  const total = sorted.reduce((sum, [, count]) => sum + count, 0)

  if (total === 0) {
    return (
      <Card className="border-border/60 bg-card shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Lead Source Mix</CardTitle>
          <CardDescription>No source data in this week.</CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <p className="text-sm text-muted-foreground">No leads yet for this period.</p>
        </CardContent>
      </Card>
    )
  }

  const chartConfig: ChartConfig = Object.fromEntries(
    sorted.map(([key], index) => [
      key,
      {
        label: key.replace(/_/g, " "),
        color: SOURCE_STOPS[index] ?? SOURCE_STOPS[SOURCE_STOPS.length - 1],
      },
    ])
  )

  const chartData = sorted.map(([source, count], index) => ({
    name: source.replace(/_/g, " "),
    value: count,
    fill: SOURCE_STOPS[index] ?? SOURCE_STOPS[SOURCE_STOPS.length - 1],
  }))

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Lead Source Mix</CardTitle>
        <CardDescription>Where demand is coming from this week.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative h-[190px] w-full">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="name" />} />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={56}
                outerRadius={80}
                paddingAngle={3}
                strokeWidth={0}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-semibold leading-none tabular-nums">{total}</span>
            <span className="mt-1 text-xs text-muted-foreground">Leads</span>
          </div>
        </div>

        <div className="grid w-full grid-cols-3 gap-x-2 gap-y-3">
          {sorted.map(([source, count], index) => (
            <div key={source} className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1.5">
                <div
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: SOURCE_STOPS[index] ?? SOURCE_STOPS[SOURCE_STOPS.length - 1] }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {shortLabel(source)}
                </span>
              </div>
              <span className="text-base font-bold tabular-nums">{count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function LeadsByDestinationCard({ leadsByLocation }: { leadsByLocation: Record<string, number> }) {
  const sorted = Object.entries(leadsByLocation)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
  const total = sorted.reduce((sum, [, count]) => sum + count, 0)

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Leads by Destination</CardTitle>
        <CardDescription>Which destinations need allocation first.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">No destination signals yet.</p>
        ) : (
          sorted.map(([slug, count], index) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            const label = slug.replace(/-/g, " ")
            const barColor =
              index === 0
                ? "color-mix(in oklch, var(--foreground) 78%, var(--background))"
                : "color-mix(in oklch, var(--foreground) 48%, var(--background))"
            return (
              <div key={slug} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate font-medium capitalize">{label}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${pct}%`,
                      background: barColor,
                    }}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function ClosedLeadsCard({ initialMetrics }: { initialMetrics: ClosedLeadsMetrics }) {
  const [metrics, setMetrics] = React.useState(initialMetrics)
  const [range, setRange] = React.useState<ClosedLeadsRange>(initialMetrics.range)
  const [dateRange, setDateRange] = React.useState<LocalDateRange | undefined>(() => ({
    from: new Date(initialMetrics.start_at),
    to: new Date(initialMetrics.end_at),
  }))
  const [isPending, startTransition] = React.useTransition()

  const refreshMetrics = React.useCallback(
    (nextRange: ClosedLeadsRange, nextDateRange?: LocalDateRange) => {
      startTransition(async () => {
        try {
          const nextMetrics = await fetchClosedLeadsMetrics(
            nextRange,
            nextRange === "custom" ? nextDateRange?.from?.toISOString() : undefined,
            nextRange === "custom" ? nextDateRange?.to?.toISOString() : undefined
          )
          setMetrics(nextMetrics)
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Failed to load closed metrics")
        }
      })
    },
    []
  )

  const wonPct = metrics.total > 0 ? Math.round((metrics.won / metrics.total) * 100) : 0

  return (
    <Card className="border-border/60 bg-card shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Closed Leads</CardTitle>
            <CardDescription>Won vs dropped outcomes in the selected range.</CardDescription>
          </div>
          <Select
            value={range}
            onValueChange={(value) => {
              const nextRange = value as ClosedLeadsRange
              setRange(nextRange)
              if (nextRange !== "custom") {
                refreshMetrics(nextRange)
              }
            }}
          >
            <SelectTrigger className="h-8 w-[136px] text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CLOSED_RANGE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {range === "custom" ? (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                  {dateRange?.from ? format(dateRange.from, "dd MMM") : "Start"}
                  <span className="text-muted-foreground">→</span>
                  {dateRange?.to ? format(dateRange.to, "dd MMM") : "End"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange as never}
                  onSelect={(value) => setDateRange(value as LocalDateRange)}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
            <Button
              size="sm"
              className="h-8"
              disabled={!dateRange?.from || !dateRange?.to || isPending}
              onClick={() => refreshMetrics("custom", dateRange)}
            >
              Apply
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Won</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">{metrics.won}</p>
          </div>
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Dropped</p>
            <p className="mt-2 text-4xl font-semibold tabular-nums">{metrics.dropped}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Win ratio in selected range</span>
            <span className="font-semibold text-foreground tabular-nums">{wonPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${wonPct}%`,
                background: "color-mix(in oklch, var(--foreground) 74%, var(--background))",
              }}
            />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {isPending ? "Refreshing metrics..." : `${metrics.total} total closed leads in this range`}
        </p>
      </CardContent>
    </Card>
  )
}

function ManagerSalesPipelineCard({ insights }: { insights: ManagerDashboardInsights }) {
  const [selectedOwnerId, setSelectedOwnerId] = React.useState("all")

  return (
    <SalesPipelineCard
      title="Sales Pipeline"
      description="Current deals in your sales pipeline."
      breakdown={insights.pipeline_breakdown}
      owners={insights.pipeline_by_owner}
      selectedOwnerId={selectedOwnerId}
      onOwnerChange={setSelectedOwnerId}
    />
  )
}

function ManagerSalesAnalyticsCard({ insights }: { insights: ManagerDashboardInsights }) {
  const [range, setRange] = React.useState("1w")

  return (
    <SalesAnalyticsCard
      title="Sales Analytics"
      description="Outcome and follow-up mix for manager decisions."
      range={range}
      onRangeChange={setRange}
      rangeOptions={[
        { value: "1w", label: "This week" },
        { value: "1m", label: "This month" },
        { value: "3m", label: "Last 3 months" },
      ]}
      metrics={[
        {
          key: "won",
          label: "Won this week",
          value: insights.won_this_week,
          color: "color-mix(in oklch, var(--foreground) 84%, var(--background))",
        },
        {
          key: "dropped",
          label: "Dropped this week",
          value: insights.dropped_this_week,
          color: "color-mix(in oklch, var(--foreground) 68%, var(--background))",
        },
        {
          key: "due",
          label: "Follow-ups due today",
          value: insights.due_today,
          color: "color-mix(in oklch, var(--foreground) 56%, var(--background))",
        },
        {
          key: "overdue",
          label: "Overdue follow-ups",
          value: insights.overdue_followups,
          color: "color-mix(in oklch, var(--foreground) 42%, var(--background))",
        },
      ]}
    />
  )
}

export function ManagerOverview({ insights, initialClosedLeadsMetrics }: ManagerOverviewProps) {
  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiStatCard title="Leads needing assignment" value={insights.unassigned_leads} subtitle="Assign now to start first contact." icon={Target} alert />
        <KpiStatCard title="Follow-ups due today" value={insights.due_today} subtitle="Close these before day-end." icon={Clock} alert />
        <KpiStatCard title="Overdue follow-ups" value={insights.overdue_followups} subtitle="Recover delayed conversations first." icon={AlertTriangle} alert />
        <KpiStatCard title="Escalations waiting" value={insights.escalated_open} subtitle="Review blocked conversations now." icon={CheckCircle2} alert />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <LeadSourcesCard leadsBySource={insights.leads_by_source} />
        <LeadsByDestinationCard leadsByLocation={insights.leads_by_location} />
        <ClosedLeadsCard initialMetrics={initialClosedLeadsMetrics} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ManagerSalesPipelineCard insights={insights} />
        <ManagerSalesAnalyticsCard insights={insights} />
      </div>
    </div>
  )
}
