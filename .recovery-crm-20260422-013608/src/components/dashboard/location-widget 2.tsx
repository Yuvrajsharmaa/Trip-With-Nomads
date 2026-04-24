"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { FileOutput } from "lucide-react"

interface LocationWidgetProps {
  data: Record<string, number>
}

export function LocationWidget({ data }: LocationWidgetProps) {
  // Sort and take top 5
  const items = Object.entries(data)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
  
  const maxVal = Math.max(...items.map(i => i[1]), 1)

  return (
    <Card className="border-border bg-card shadow-sm h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-xl font-bold text-foreground tracking-tight">Sales by Location</CardTitle>
          <p className="text-xs text-muted-foreground font-medium mt-0.5">Leads distribution by destination</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-2 rounded-xl border-border text-xs font-bold text-muted-foreground shadow-none">
          <FileOutput className="size-3.5" />
          Export
        </Button>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        {items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">No destination data</p>
          </div>
        ) : (
          items.map(([location, count]) => {
            const percentage = Math.round((count / maxVal) * 100)
            // Use a stable "random" value based on the location name to avoid hydration mismatch
            const stableSeed = location.length
            const trend = ((stableSeed % 8) + 1).toFixed(1)
            const isUp = stableSeed % 2 === 0

            return (
              <div key={location} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-foreground capitalize">
                      {location.replace(/-/g, " ")}
                    </span>
                    <span className={cn(
                      "text-[9px] font-black px-1.5 py-0.5 rounded-full border",
                      isUp ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" : "text-rose-600 bg-rose-500/10 border-rose-500/20"
                    )}>
                      {isUp ? "+" : "-"}{trend}%
                    </span>
                  </div>
                  <span className="text-xs font-bold text-foreground tabular-nums">
                    {percentage}%
                  </span>
                </div>
                <Progress value={percentage} className="h-2 bg-muted" />
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

// Helper for conditional classes if not imported
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
