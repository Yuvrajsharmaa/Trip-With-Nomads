"use client"

import { Pie, PieChart, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

interface SourceWidgetProps {
  data: Record<string, number>
}

const COLORS = ["#09090b", "#71717a", "#a1a1aa", "#d4d4d8", "#e4e4e7"]

export function SourceWidget({ data }: SourceWidgetProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name,
    value,
  })).sort((a, b) => b.value - a.value)

  const chartConfig = Object.fromEntries(
    chartData.map((d, i) => [
      d.name,
      { label: d.name, color: COLORS[i % COLORS.length] }
    ])
  ) satisfies ChartConfig

  return (
    <Card className="flex flex-col border-border shadow-none bg-card">
      <CardHeader className="items-center pb-0 text-center">
        <CardTitle className="text-xs font-black uppercase tracking-widest text-foreground">Lead Source Distribution</CardTitle>
        <CardDescription className="text-[10px] font-medium text-muted-foreground">Current active pipeline by origin</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[250px]"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              innerRadius={60}
              strokeWidth={2}
              stroke="var(--border)"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
