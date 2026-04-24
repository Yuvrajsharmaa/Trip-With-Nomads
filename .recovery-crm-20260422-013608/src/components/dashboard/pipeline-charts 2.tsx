"use client";

import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileUp, TrendingUp } from "lucide-react";

const PIPELINE_DATA = [
  { name: "Lead", count: 235, revenue: "$420.5k", percentage: "38%" },
  { name: "Qualified", count: 146, revenue: "$267.8k", percentage: "24%" },
  { name: "Proposal", count: 84, revenue: "$192.4k", percentage: "18%" },
  { name: "Negot.", count: 52, revenue: "$129.6k", percentage: "12%" },
  { name: "Won", count: 36, revenue: "$87.2k", percentage: "8%" },
];

const SOURCE_DATA = [
  { name: "Social", value: 275, color: "hsl(var(--primary))" },
  { name: "Email", value: 200, color: "hsl(var(--primary) / 0.7)" },
  { name: "Call", value: 287, color: "hsl(var(--primary) / 0.4)" },
  { name: "Other", value: 173, color: "hsl(var(--primary) / 0.2)" },
];

export function LeadSourceChart() {
  return (
    <Card className="border border-border shadow-sm h-full bg-card rounded-3xl flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-0.5">
           <CardTitle className="text-sm font-black font-heading tracking-tight uppercase text-foreground">Source Origin</CardTitle>
           <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Lead distribution</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl">
          <FileUp className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-between pt-4 pb-8 px-8">
        <div className="h-[180px] w-full relative flex items-center justify-center">
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
             <span className="text-3xl font-black font-heading tracking-tighter text-foreground">935</span>
             <div className="flex items-center gap-1 text-emerald-500">
               <TrendingUp className="size-2.5" />
               <span className="text-[9px] font-black tracking-widest uppercase">+12%</span>
             </div>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={SOURCE_DATA}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={85}
                paddingAngle={0}
                stroke="none"
                dataKey="value"
                animationDuration={1000}
              >
                {SOURCE_DATA.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        <div className="grid grid-cols-2 gap-y-4 gap-x-8 w-full mt-6">
          {SOURCE_DATA.map((item) => (
            <div key={item.name} className="flex items-center gap-3">
              <div className="size-1.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5 leading-none">{item.name}</span>
                <span className="text-xs font-black font-heading text-foreground leading-none">{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function SalesPipeline() {
  return (
    <Card className="border border-border shadow-sm h-full bg-card rounded-3xl flex flex-col">
      <CardHeader className="pb-4">
        <div className="space-y-0.5">
           <CardTitle className="text-sm font-black font-heading tracking-tight uppercase text-foreground">Leads Funnel</CardTitle>
           <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Conversion efficiency</p>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between space-y-4 pb-8">
        {/* Simple segmented progress bar */}
        <div className="w-full h-1.5 rounded-full overflow-hidden flex gap-0.5 mb-2">
          {PIPELINE_DATA.map((stage, i) => (
            <div 
              key={`bar-${stage.name}`} 
              className="h-full bg-primary first:rounded-l-full last:rounded-r-full" 
              style={{ width: stage.percentage, opacity: 1 - (i * 0.15) }} 
            />
          ))}
        </div>

        <div className="space-y-3 mt-2">
          {PIPELINE_DATA.map((stage, i) => (
            <div key={stage.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-1 rounded-full bg-primary" style={{ opacity: 1 - (i * 0.15) }} />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-foreground leading-none mb-1">{stage.name}</span>
                  <span className="text-[9px] text-muted-foreground font-bold">{stage.count} deals · {stage.revenue}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                 <div className="h-1 w-12 bg-muted rounded-full overflow-hidden border border-border/50">
                    <div className="h-full bg-primary" style={{ width: stage.percentage, opacity: 1 - (i * 0.15) }} />
                 </div>
                 <span className="text-[10px] text-muted-foreground font-black tracking-widest w-6 text-right">{stage.percentage}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
