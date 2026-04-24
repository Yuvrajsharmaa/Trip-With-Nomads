"use client";

import { useState } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  ChevronDown, 
  ExternalLink, 
  Search,
  MoreHorizontal,
  Mail,
  Phone,
  ArrowUpDown
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock data remains for development
const MOCK_LEADS = [
  {
    id: "1",
    full_name: "Rahul Sharma",
    email: "rahul@nomad.com",
    phone: "+91 98765 43210",
    source: "Instagram",
    package: "Spiti Expedition",
    amount: "₹1,45,000",
    crm_status: "new",
    created_at: new Date().toISOString(),
  },
  {
    id: "2",
    full_name: "Ananya Kapoor",
    email: "ananya@globe.in",
    phone: "+91 91234 56789",
    source: "Facebook",
    package: "Ladakh Bike Trip",
    amount: "₹2,10,000",
    crm_status: "follow_up_1",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "3",
    full_name: "Vikram Singh",
    email: "vikram.s@travels.com",
    phone: "+91 88888 77777",
    source: "Direct",
    package: "Kerala Backwaters",
    amount: "₹85,000",
    crm_status: "converted",
    created_at: new Date(Date.now() - 172800000).toISOString(),
  }
];

const STATUS_CONFIG: Record<string, { label: string, color: string, border: string, bg: string }> = {
  new: { label: "New Lead", color: "text-blue-600", border: "border-blue-500/20", bg: "bg-blue-500/10" },
  follow_up_1: { label: "F/Up 1", color: "text-orange-600", border: "border-orange-500/20", bg: "bg-orange-500/10" },
  follow_up_2: { label: "F/Up 2", color: "text-amber-600", border: "border-amber-500/20", bg: "bg-amber-500/10" },
  follow_up_3: { label: "F/Up 3", color: "text-red-600", border: "border-red-500/20", bg: "bg-red-500/10" },
  warm: { label: "Warm", color: "text-emerald-600", border: "border-emerald-500/20", bg: "bg-emerald-500/10" },
  not_interested: { label: "Dropped", color: "text-muted-foreground", border: "border-border", bg: "bg-muted" },
  converted: { label: "Won", color: "text-emerald-600", border: "border-emerald-500/20", bg: "bg-emerald-500/10" },
};

const TABS = ["All Leads", "New", "Follow-ups", "Won/Dropped"];

export function AgentLeadList() {
  const [activeTab, setActiveTab] = useState("All Leads");

  return (
    <div className="bg-card rounded-3xl border border-border shadow-sm overflow-hidden flex flex-col">
      
      {/* Header & Tabs */}
      <div className="px-8 py-6 border-b border-border/50 bg-muted/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
           <div>
             <h2 className="text-xl font-bold font-heading tracking-tight uppercase text-foreground">Active Leads</h2>
             <div className="flex items-center gap-2 mt-1">
                <div className="size-1.5 rounded-full bg-orange-500 animate-pulse" />
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">12 Actionable Items</p>
             </div>
           </div>
           <div className="flex items-center gap-2">
             <div className="relative max-w-[240px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
                <Input 
                  placeholder="Filter leads..." 
                  className="pl-9 h-8 font-sans text-[10px] font-bold rounded-xl border-border bg-background placeholder:uppercase tracking-widest"
                />
             </div>
             <Button variant="outline" size="sm" className="h-8 rounded-xl border-border bg-card font-bold text-[10px] uppercase tracking-widest text-muted-foreground font-sans">
                Filter
                <ChevronDown className="ml-1.5 size-3" />
             </Button>
           </div>
        </div>

        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl w-fit">
           {TABS.map(tab => (
             <button
               key={tab}
               onClick={() => setActiveTab(tab)}
               className={cn(
                 "px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all",
                 activeTab === tab 
                   ? "bg-card text-foreground shadow-sm border border-border" 
                   : "text-muted-foreground hover:text-foreground"
               )}
             >
               {tab}
             </button>
           ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50 bg-muted/10">
              <TableHead className="pl-8 font-heading font-bold text-[9px] text-muted-foreground uppercase tracking-widest py-3 h-auto">
                <div className="flex items-center gap-2">
                  Customer
                  <ArrowUpDown className="size-3 opacity-50" />
                </div>
              </TableHead>
              <TableHead className="font-heading font-bold text-[9px] text-muted-foreground uppercase tracking-widest py-3 h-auto">Status</TableHead>
              <TableHead className="font-heading font-bold text-[9px] text-muted-foreground uppercase tracking-widest py-3 h-auto hidden lg:table-cell text-center">Package / Source</TableHead>
              <TableHead className="font-heading font-bold text-[9px] text-muted-foreground uppercase tracking-widest py-3 h-auto text-right">Value</TableHead>
              <TableHead className="text-right pr-8 font-heading font-bold text-[9px] text-muted-foreground uppercase tracking-widest py-3 h-auto">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_LEADS.map((lead) => (
              <TableRow key={lead.id} className="group border-border/50 hover:bg-muted/30 transition-all cursor-pointer">
                <TableCell className="pl-8 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-xl bg-muted flex items-center justify-center font-bold text-muted-foreground text-[10px] border border-border uppercase">
                      {lead.full_name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-bold text-foreground font-heading text-xs uppercase tracking-tight leading-none mb-0.5 group-hover:text-primary transition-colors">{lead.full_name}</span>
                      <span className="text-[9px] text-muted-foreground font-bold font-sans flex items-center gap-1 lowercase">
                        <Mail className="size-2 text-muted-foreground/50" />
                        {lead.email}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                   <div className={cn(
                     "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[8px] font-bold uppercase tracking-[0.05em] border shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
                     STATUS_CONFIG[lead.crm_status]?.color,
                     STATUS_CONFIG[lead.crm_status]?.border,
                     STATUS_CONFIG[lead.crm_status]?.bg
                   )}>
                      {STATUS_CONFIG[lead.crm_status]?.label}
                   </div>
                </TableCell>
                <TableCell className="hidden lg:table-cell text-center">
                   <div className="flex flex-col items-center">
                      <span className="text-[9px] text-foreground font-bold font-sans uppercase tracking-tight">{lead.package}</span>
                      <span className="text-[8px] text-muted-foreground/60 font-bold uppercase tracking-widest">{lead.source}</span>
                   </div>
                </TableCell>
                <TableCell className="font-heading font-bold text-xs text-foreground text-right">
                  {lead.amount}
                </TableCell>
                <TableCell className="text-right pr-8">
                   <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all">
                        <Phone className="h-3 w-3" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-7 w-7 border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                         <ExternalLink className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                        <MoreHorizontal className="h-3 w-3" />
                      </Button>
                   </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="p-4 bg-muted/20 mt-auto flex items-center justify-between px-8 py-3.5 border-t border-border/50">
         <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Showing 3 of 12 leads</p>
         <div className="flex items-center gap-3">
            <button className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 disabled:opacity-30 cursor-default" disabled>Prev</button>
            <div className="h-1 w-8 bg-muted rounded-full overflow-hidden">
               <div className="h-full bg-primary/40 w-1/3" />
            </div>
            <button className="text-[9px] font-bold uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity">Next</button>
         </div>
      </div>
    </div>
  );
}
