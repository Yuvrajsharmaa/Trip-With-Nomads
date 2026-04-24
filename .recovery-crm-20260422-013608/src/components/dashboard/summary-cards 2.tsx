"use client";

import { 
  Users, 
  Briefcase,
  FileText,
  TrendingUp,
  TrendingDown
} from "lucide-react";
import { Card } from "@/components/ui/card";

export function SummaryCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 px-6 md:px-8 py-2">
      {/* Target Status - Simplified */}
      <Card className="border border-border shadow-sm bg-card rounded-2xl p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Monthly Target</span>
          <div className="flex items-center gap-1">
             <span className="text-xs font-bold text-foreground">48%</span>
             <div className="w-12 h-1 bg-muted rounded-full overflow-hidden shrink-0">
               <div className="h-full bg-primary w-[48%]" />
             </div>
          </div>
        </div>
        <div className="mt-auto">
          <div className="text-[11px] text-muted-foreground font-medium leading-tight">
            <span className="text-foreground font-bold">2.4%</span> above current expected pace
          </div>
        </div>
      </Card>

      {/* Customers - Minimal */}
      <Card className="border border-border shadow-sm bg-card rounded-2xl p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Customers</span>
          <Users className="size-3.5 text-muted-foreground/50" />
        </div>
        <div className="mt-auto">
          <div className="text-2xl font-bold font-heading text-foreground leading-none">1,890</div>
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight mt-1.5 flex items-center gap-1">
            <TrendingUp className="size-2.5 text-emerald-500" />
            <span className="text-emerald-500">10.4%</span> growth vs lM
          </div>
        </div>
      </Card>

      {/* Deals - Minimal */}
      <Card className="border border-border shadow-sm bg-card rounded-2xl p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Active Deals</span>
          <Briefcase className="size-3.5 text-muted-foreground/50" />
        </div>
        <div className="mt-auto">
          <div className="text-2xl font-bold font-heading text-foreground leading-none">1,312</div>
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight mt-1.5 flex items-center gap-1">
             <TrendingDown className="size-2.5 text-rose-500" />
             <span className="text-rose-500">0.8%</span> churn risk
          </div>
        </div>
      </Card>

      {/* Revenue - Simplified */}
      <Card className="border border-border shadow-sm bg-card rounded-2xl p-6 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Revenue</span>
          <FileText className="size-3.5 text-muted-foreground/50" />
        </div>
        <div className="mt-auto">
          <div className="text-2xl font-bold font-heading text-foreground leading-none">$435,578</div>
          <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-tight mt-1.5 flex items-center gap-1">
            <TrendingUp className="size-2.5 text-emerald-500" />
            <span className="text-emerald-500">20.1%</span> vs prev period
          </div>
        </div>
      </Card>
    </div>
  );
}
