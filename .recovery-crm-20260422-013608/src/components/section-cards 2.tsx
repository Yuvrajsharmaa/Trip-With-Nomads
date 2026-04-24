"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { 
  Users, 
  UserPlus, 
  AlertCircle, 
  Clock, 
} from "lucide-react"
import type { DashboardInsights } from "@/types/dashboard"
import { CardContent } from "@/components/ui/card"

export function SectionCards({ insights }: { insights: DashboardInsights }) {
  const stats = [
    {
      label: "Ready to Assign",
      value: insights.unassigned_leads,
      description: "Needs allocation",
      icon: UserPlus,
      color: "text-blue-600",
      bg: "bg-blue-100/50",
      trend: "+5.2%",
      trendType: "up"
    },
    {
      label: "Urgent Tasks",
      value: insights.due_today,
      description: "Follow-ups due",
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-100/50",
      trend: "Critical",
      trendType: "neutral"
    },
    {
      label: "My Pipeline",
      value: insights.my_open_leads,
      description: "Active personal leads",
      icon: Users,
      color: "text-indigo-600",
      bg: "bg-indigo-100/50",
      trend: "+12.1%",
      trendType: "up"
    },
    {
      label: "Escalated",
      value: insights.escalated_open,
      description: "Needs intervention",
      icon: AlertCircle,
      color: "text-rose-600",
      bg: "bg-rose-100/50",
      trend: "Review",
      trendType: "down"
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="relative overflow-hidden border-border shadow-sm transition-all hover:shadow-md hover:border-border/80 bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </CardDescription>
            <div className={`p-2 rounded-xl bg-muted ${stat.color}`}>
              <stat.icon className="size-4" />
            </div>
          </CardHeader>
          <CardContent className="pb-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-foreground">
                {stat.value}
              </span>
              {stat.trend && (
                <Badge variant="outline" className={`text-[10px] font-bold px-1.5 py-0 border-0 ${
                  stat.trendType === "up" ? "bg-emerald-500/10 text-emerald-600" : 
                  stat.trendType === "down" ? "bg-rose-500/10 text-rose-600" : 
                  "bg-muted text-muted-foreground"
                }`}>
                  {stat.trend}
                </Badge>
              )}
            </div>
            <p className="text-[11px] font-medium text-muted-foreground mt-1">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
