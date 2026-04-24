"use client";

import { useState, useTransition, useSyncExternalStore, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
// Avatar removed per design update
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Phone,
  ChevronLeft,
  ChevronRight,
  Inbox,
  TriangleAlert,
  MoreHorizontal,
  Eye,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import type { Lead, LeadFilter } from "@/types/leads";
import { STATUS_CONFIG, LEAD_FILTER_TABS, LEAD_STATUSES } from "@/types/leads";
import { useLeadsRealtime } from "@/hooks/use-leads-realtime";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { DuplicateQueueItem } from "@/types/duplicates";

import { LeadKanban } from "@/components/dashboard/lead-kanban";
import { DuplicateQueuePanel } from "@/components/dashboard/duplicate-queue-panel";

interface LeadsTableProps {
  initialLeads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  filter: LeadFilter;
  search: string;
  source?: string;
  leadType?: string;
  followup?: string;
  owner?: string;
  team?: string;
  stage?: string;
  createdFrom?: string;
  createdTo?: string;
  counts: Record<LeadFilter, number>;
  currentUserId: string;
  baseRoute?: string;
  showDuplicateTab?: boolean;
  duplicatePendingCount?: number;
  duplicateQueueItems?: DuplicateQueueItem[];
  duplicateQueueError?: string | null;
  ownerOptions?: Array<{ id: string; name: string }>;
  teamOptions?: Array<{ id: string; name: string }>;
}

import { useDebounce } from "@/hooks/use-debounce";
import { useEffect } from "react";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export function LeadsTable({
  initialLeads,
  total,
  page,
  pageSize,
  filter,
  search: initialSearch,
  source = "all",
  leadType = "all",
  followup = "all",
  owner = "all",
  team = "all",
  stage = "all",
  createdFrom = "",
  createdTo = "",
  counts,
  currentUserId,
  baseRoute = "/dashboard/leads",
  showDuplicateTab = false,
  duplicatePendingCount = 0,
  duplicateQueueItems = [],
  duplicateQueueError = null,
  ownerOptions = [],
  teamOptions = [],
}: LeadsTableProps) {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState(initialSearch);
  const debouncedSearch = useDebounce(searchValue, 300);
  const [isPending, startTransition] = useTransition();
  const [view, setView] = useState<"list" | "board">("list");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [ownerValue, setOwnerValue] = useState(owner);
  const [teamValue, setTeamValue] = useState(team);
  const [createdFromValue, setCreatedFromValue] = useState(createdFrom);
  const [createdToValue, setCreatedToValue] = useState(createdTo);

  const mounted = useHydrated();
  const visibleTabs = useMemo(
    () =>
      LEAD_FILTER_TABS.filter((tab) =>
        showDuplicateTab ? true : tab.key !== "duplicates"
      ),
    [showDuplicateTab]
  );

  // Realtime: auto-updates when new leads arrive via websocket
  const { leads } = useLeadsRealtime(initialLeads);

  const totalPages = Math.ceil(total / pageSize);

  const navigate = useCallback((params: {
    filter?: LeadFilter;
    search?: string;
    source?: string;
    leadType?: string;
    followup?: string;
    owner?: string;
    team?: string;
    stage?: string;
    createdFrom?: string;
    createdTo?: string;
    page?: number;
  }) => {
    const sp = new URLSearchParams();
    sp.set("filter", params.filter ?? filter);
    
    const s = params.search ?? searchValue;
    if (s) sp.set("q", s);
    
    const src = params.source ?? source;
    if (src && src !== "all") sp.set("source", src);
    
    const lt = params.leadType ?? leadType;
    if (lt && lt !== "all") sp.set("type", lt);

    const followupValue = params.followup ?? followup;
    if (followupValue && followupValue !== "all") sp.set("followup", followupValue);

    const ownerValue = params.owner ?? owner;
    if (ownerValue && ownerValue !== "all") sp.set("owner", ownerValue);

    const teamValue = params.team ?? team;
    if (teamValue && teamValue !== "all") sp.set("team", teamValue);

    const stageValue = params.stage ?? stage;
    if (stageValue && stageValue !== "all") sp.set("status", stageValue);

    const createdFromNext = params.createdFrom ?? createdFrom;
    if (createdFromNext) sp.set("created_from", createdFromNext);

    const createdToNext = params.createdTo ?? createdTo;
    if (createdToNext) sp.set("created_to", createdToNext);
    
    sp.set("page", String(params.page ?? 1));
    startTransition(() => {
      router.push(`${baseRoute}?${sp.toString()}`);
    });
  }, [baseRoute, createdFrom, createdTo, filter, followup, leadType, owner, router, searchValue, source, stage, startTransition, team]);

  // Live search effect
  useEffect(() => {
    if (debouncedSearch !== initialSearch) {
      navigate({ search: debouncedSearch, page: 1 });
    }
  }, [debouncedSearch, initialSearch, navigate]);

  useEffect(() => {
    setCreatedFromValue(createdFrom);
  }, [createdFrom]);

  useEffect(() => {
    setCreatedToValue(createdTo);
  }, [createdTo]);

  useEffect(() => {
    setOwnerValue(owner);
  }, [owner]);

  useEffect(() => {
    setTeamValue(team);
  }, [team]);

  const sourceLabelMap = useMemo(
    () =>
      ({
        "Trip Page Lead": "Trip Page",
        "Booking Invite": "Booking Invite",
        "General Lead": "General Lead",
        "Waitlist Popup": "Waitlist",
        "Custom Trip Lead": "Custom Trip",
        "NTC Invite": "NTC Invite",
      }) as const,
    []
  );

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];

    if (initialSearch) {
      chips.push({
        key: "search",
        label: `Search: ${initialSearch}`,
        clear: () => {
          setSearchValue("");
          navigate({ search: "", page: 1 });
        },
      });
    }

    if (source !== "all") {
      chips.push({
        key: "source",
        label: `Source: ${sourceLabelMap[source as keyof typeof sourceLabelMap] ?? source}`,
        clear: () => navigate({ source: "all", page: 1 }),
      });
    }

    if (leadType !== "all") {
      chips.push({
        key: "trip-type",
        label: `Trip Type: ${leadType === "domestic" ? "Domestic" : "International"}`,
        clear: () => navigate({ leadType: "all", page: 1 }),
      });
    }

    if (followup !== "all") {
      const followupLabel =
        followup === "due_today"
          ? "Due Today"
          : followup === "overdue"
            ? "Overdue"
            : "Unscheduled";
      chips.push({
        key: "followup",
        label: `Follow-up: ${followupLabel}`,
        clear: () => navigate({ followup: "all", page: 1 }),
      });
    }

    if (stage !== "all") {
      chips.push({
        key: "stage",
        label: `Stage: ${STATUS_CONFIG[stage as keyof typeof STATUS_CONFIG]?.label ?? stage}`,
        clear: () => navigate({ stage: "all", page: 1 }),
      });
    }

    if (owner !== "all") {
      const ownerName = ownerOptions.find((item) => item.id === owner)?.name ?? "Selected";
      chips.push({
        key: "owner",
        label: `Owner: ${ownerName}`,
        clear: () => {
          setOwnerValue("all");
          navigate({ owner: "all", page: 1 });
        },
      });
    }

    if (team !== "all") {
      const teamName = teamOptions.find((item) => item.id === team)?.name ?? "Selected";
      chips.push({
        key: "team",
        label: `Team: ${teamName}`,
        clear: () => {
          setTeamValue("all");
          navigate({ team: "all", page: 1 });
        },
      });
    }

    if (createdFrom || createdTo) {
      chips.push({
        key: "created-range",
        label: `Created: ${createdFrom || "Start"} -> ${createdTo || "End"}`,
        clear: () => {
          setCreatedFromValue("");
          setCreatedToValue("");
          navigate({ createdFrom: "", createdTo: "", page: 1 });
        },
      });
    }

    return chips;
  }, [createdFrom, createdTo, followup, initialSearch, leadType, navigate, owner, ownerOptions, source, sourceLabelMap, stage, team, teamOptions]);

  return (
    <Card className="flex flex-col h-full overflow-hidden shadow-sm border-border bg-card/50">

      {/* Tabs + Search + Filters */}
      <CardHeader className="p-0 border-b border-border/50 bg-card z-10 shrink-0">
        <div className="px-6 md:px-8 py-5 flex flex-col gap-5">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-muted p-1 rounded-lg w-fit">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => navigate({ filter: tab.key, page: 1 })}
                className={cn(
                  "px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center gap-2",
                  filter === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                {tab.key === "duplicates" && duplicatePendingCount > 0 ? (
                  <span className="size-1.5 rounded-full bg-destructive" />
                ) : null}
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    filter === tab.key
                      ? tab.key === "duplicates" && duplicatePendingCount > 0
                        ? "text-destructive font-bold"
                        : "text-primary font-bold"
                      : tab.key === "duplicates" && duplicatePendingCount > 0
                        ? "text-destructive/80"
                        : "text-muted-foreground/40"
                  )}
                >
                  {tab.key === "duplicates"
                    ? duplicatePendingCount
                    : counts[tab.key]}
                </span>
              </button>
            ))}
          </div>

          {filter !== "duplicates" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-muted p-1 rounded-xl">
                <Button
                  variant={view === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className={cn("size-8 rounded-lg", view === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setView("list")}
                  title="List View"
                >
                  <ListIcon className="size-4" />
                </Button>
                <Button
                  variant={view === "board" ? "secondary" : "ghost"}
                  size="icon"
                  className={cn("size-8 rounded-lg", view === "board" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground")}
                  onClick={() => setView("board")}
                  title="Kanban Board View"
                >
                  <LayoutGrid className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Search + quick filters + active chips */}
        {filter !== "duplicates" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input
                  placeholder="Search lead, email, phone, trip..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="pl-9 h-10 text-sm border-border bg-background placeholder:text-muted-foreground/60 rounded-xl focus:ring-1 ring-primary/20 transition-all"
                />
              </div>

              <Select value={source} onValueChange={(val) => navigate({ source: val, page: 1 })}>
                <SelectTrigger className="h-10 min-w-[138px] rounded-xl bg-background border-border text-[11px] font-bold">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs font-medium">All Sources</SelectItem>
                  <SelectItem value="Trip Page Lead" className="text-xs font-medium">Trip Page</SelectItem>
                  <SelectItem value="Booking Invite" className="text-xs font-medium">Booking Invite</SelectItem>
                  <SelectItem value="General Lead" className="text-xs font-medium">General Lead</SelectItem>
                  <SelectItem value="Waitlist Popup" className="text-xs font-medium">Waitlist</SelectItem>
                  <SelectItem value="Custom Trip Lead" className="text-xs font-medium">Custom Trip</SelectItem>
                  <SelectItem value="NTC Invite" className="text-xs font-medium">NTC Invite</SelectItem>
                </SelectContent>
              </Select>

              <Select value={leadType} onValueChange={(val) => navigate({ leadType: val, page: 1 })}>
                <SelectTrigger className="h-10 min-w-[132px] rounded-xl bg-background border-border text-[11px] font-bold">
                  <SelectValue placeholder="Trip Type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs font-medium">All Trip Types</SelectItem>
                  <SelectItem value="domestic" className="text-xs font-medium">Domestic</SelectItem>
                  <SelectItem value="international" className="text-xs font-medium">International</SelectItem>
                </SelectContent>
              </Select>

              <Select value={followup} onValueChange={(val) => navigate({ followup: val, page: 1 })}>
                <SelectTrigger className="h-10 min-w-[146px] rounded-xl bg-background border-border text-[11px] font-bold">
                  <SelectValue placeholder="Follow-up" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs font-medium">All Follow-ups</SelectItem>
                  <SelectItem value="due_today" className="text-xs font-medium">Due Today</SelectItem>
                  <SelectItem value="overdue" className="text-xs font-medium">Overdue</SelectItem>
                  <SelectItem value="unscheduled" className="text-xs font-medium">Unscheduled</SelectItem>
                </SelectContent>
              </Select>

              <Select value={stage} onValueChange={(val) => navigate({ stage: val, page: 1 })}>
                <SelectTrigger className="h-10 min-w-[132px] rounded-xl bg-background border-border text-[11px] font-bold">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all" className="text-xs font-medium">All Stages</SelectItem>
                  {LEAD_STATUSES.map((statusItem) => (
                    <SelectItem key={statusItem} value={statusItem} className="text-xs font-medium">
                      {STATUS_CONFIG[statusItem].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Sheet open={advancedFiltersOpen} onOpenChange={setAdvancedFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-10 rounded-xl text-[11px] font-bold">
                    <SlidersHorizontal className="size-4 mr-1.5" />
                    More Filters
                    {(owner !== "all" || team !== "all" || Boolean(createdFrom) || Boolean(createdTo)) ? (
                      <Badge variant="secondary" className="ml-2 h-4 px-1.5 text-[9px]">
                        {Number(owner !== "all") + Number(team !== "all") + Number(Boolean(createdFrom) || Boolean(createdTo))}
                      </Badge>
                    ) : null}
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Advanced Filters</SheetTitle>
                    <SheetDescription>
                      Narrow by owner, team, and created-date range for deeper lead audits.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex flex-col gap-4 px-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Owner</p>
                      <Select value={ownerValue} onValueChange={setOwnerValue}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue placeholder="All Owners" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs font-medium">All Owners</SelectItem>
                          {ownerOptions.map((item) => (
                            <SelectItem key={item.id} value={item.id} className="text-xs font-medium">
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">Team</p>
                      <Select value={teamValue} onValueChange={setTeamValue}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue placeholder="All Teams" />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="all" className="text-xs font-medium">All Teams</SelectItem>
                          {teamOptions.map((item) => (
                            <SelectItem key={item.id} value={item.id} className="text-xs font-medium">
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Created from</p>
                        <Input
                          type="date"
                          value={createdFromValue}
                          onChange={(event) => setCreatedFromValue(event.target.value)}
                          className="h-10 rounded-xl bg-background border-border text-[11px] font-medium"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Created to</p>
                        <Input
                          type="date"
                          value={createdToValue}
                          onChange={(event) => setCreatedToValue(event.target.value)}
                          className="h-10 rounded-xl bg-background border-border text-[11px] font-medium"
                        />
                      </div>
                    </div>
                  </div>

                  <SheetFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setOwnerValue("all");
                        setTeamValue("all");
                        setCreatedFromValue("");
                        setCreatedToValue("");
                        navigate({ owner: "all", team: "all", createdFrom: "", createdTo: "", page: 1 });
                        setAdvancedFiltersOpen(false);
                      }}
                    >
                      Clear advanced filters
                    </Button>
                    <Button
                      onClick={() => {
                        navigate({
                          owner: ownerValue,
                          team: teamValue,
                          createdFrom: createdFromValue,
                          createdTo: createdToValue,
                          page: 1,
                        });
                        setAdvancedFiltersOpen(false);
                      }}
                    >
                      Apply filters
                    </Button>
                  </SheetFooter>
                </SheetContent>
              </Sheet>
            </div>

            {activeFilterChips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {activeFilterChips.map((chip) => (
                  <Button
                    key={chip.key}
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-lg text-[11px] font-medium text-muted-foreground"
                    onClick={chip.clear}
                  >
                    {chip.label}
                    <X className="size-3.5 ml-1" />
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearchValue("");
                    setOwnerValue("all");
                    setTeamValue("all");
                    setCreatedFromValue("");
                    setCreatedToValue("");
                    navigate({
                      search: "",
                      source: "all",
                      leadType: "all",
                      followup: "all",
                      owner: "all",
                      team: "all",
                      stage: "all",
                      createdFrom: "",
                      createdTo: "",
                      page: 1,
                    });
                  }}
                >
                  Clear all filters
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Resolve duplicate pairs before assignment so the team works one clean record per traveler.
          </p>
        )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-auto flex flex-col relative">
      
      {/* Inline Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 w-full bg-primary/5 border-b border-primary/20 px-6 py-2.5 flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="size-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">
              {selectedIds.size}
            </div>
            <span className="text-[11px] font-bold uppercase tracking-widest text-primary">Leads Selected</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 text-[11px] font-bold uppercase tracking-widest text-foreground hover:bg-primary/10 rounded-lg"
              onClick={() => {
                toast.success(`Assigning ${selectedIds.size} leads to you...`);
                setSelectedIds(new Set());
              }}
            >
              Assign to Me
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 text-[11px] font-bold uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 rounded-lg"
              onClick={() => {
                toast.success(`Marking ${selectedIds.size} leads as won...`);
                setSelectedIds(new Set());
              }}
            >
              Won
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 text-[11px] font-bold uppercase tracking-widest text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg"
              onClick={() => {
                toast.success(`Marking ${selectedIds.size} leads as dropped...`);
                setSelectedIds(new Set());
              }}
            >
              Dropped
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-8 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted rounded-lg"
              onClick={() => {
                toast.success(`Archiving ${selectedIds.size} leads...`);
                setSelectedIds(new Set());
              }}
            >
              Archive
            </Button>
            <Separator orientation="vertical" className="h-4 mx-2 bg-primary/20" />
            <Button 
              size="sm" 
              variant="secondary" 
              className="h-8 text-[11px] font-bold uppercase tracking-widest rounded-lg bg-background text-foreground hover:bg-muted border border-border/50"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear Selection
            </Button>
          </div>
        </div>
      )}

      {/* Table/Board or Empty State */}
      {showDuplicateTab && filter === "duplicates" ? (
        <div className="p-4 md:p-5">
          <DuplicateQueuePanel
            initialItems={duplicateQueueItems}
            initialError={duplicateQueueError || undefined}
            expectedPendingCount={duplicatePendingCount}
            className="border-0 bg-transparent shadow-none"
          />
        </div>
      ) : leads.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="size-12 rounded-xl bg-muted flex items-center justify-center mb-4">
            <Inbox className="size-5 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">
            {initialSearch ? "No matches found" : "Pipeline Empty"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-xs">
            {initialSearch
              ? `No results for "${initialSearch}". Try checking the spelling or contact info.`
              : "Inbound customer requests from all channels will appear here automatically."}
          </p>
        </div>
      ) : view === "board" ? (
        <div className="flex-1 min-h-0 bg-muted/20">
          <LeadKanban 
            leads={leads} 
            currentUserId={currentUserId}
          />
        </div>
      ) : (
        <>
          {/* Data Table */}
          <div className="flex-1 overflow-x-auto min-h-0">
            <Table>
              <TableHeader className="sticky top-0 z-10">
                <TableRow className="hover:bg-transparent border-b border-border/50 bg-muted/20">
                  <TableHead className="w-[40px] pl-6 md:pl-8">
                    <Checkbox 
                      checked={selectedIds.size === leads.length && leads.length > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds(new Set(leads.map(l => l.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest">
                    Customer
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest">
                    Phone
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest">
                    Status
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest hidden md:table-cell">
                    Source
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest hidden lg:table-cell">
                    Trip
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest hidden xl:table-cell">
                    Owner
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest hidden xl:table-cell">
                    Next Contact
                  </TableHead>
                  <TableHead className="font-bold text-[10px] text-muted-foreground uppercase py-4 h-auto tracking-widest hidden xl:table-cell text-right pr-2">
                    Lead Lifetime
                  </TableHead>
                  <TableHead className="font-semibold text-[11px] text-muted-foreground py-4 h-auto text-center w-[60px] pr-6 md:pr-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const cfg =
                    STATUS_CONFIG[lead.crm_status] || STATUS_CONFIG.new;
                  return (
                    <TableRow
                      key={lead.id}
                      className={cn(
                        "group transition-all cursor-pointer border-b border-border/50 hover:bg-muted/10 active:bg-muted/20",
                        lead.escalated_at && "bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/20",
                        isPending && "opacity-60"
                      )}
                      onClick={() => {
                        router.push(`${baseRoute}/${lead.id}`);
                      }}
                    >
                      {/* Checkbox */}
                      <TableCell className="pl-6 md:pl-8 py-3.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(selectedIds);
                            if (checked) newSet.add(lead.id);
                            else newSet.delete(lead.id);
                            setSelectedIds(newSet);
                          }}
                        />
                      </TableCell>

                      {/* Name + Email */}
                      <TableCell className="py-3.5">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-foreground truncate leading-tight">
                            {lead.name || "—"}
                          </div>
                          <div className="text-[11px] text-muted-foreground/60 truncate font-normal mt-0.5">
                            {lead.email}
                          </div>
                        </div>
                      </TableCell>

                      {/* Phone */}
                      <TableCell className="py-3.5">
                        {lead.phone ? (
                          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <Phone className="size-3 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                            <span className="tabular-nums">{lead.phone}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/30">—</span>
                        )}
                      </TableCell>

                      {/* Status Badge */}
                      <TableCell className="py-3.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border transition-all",
                            cfg.text,
                            cfg.bg,
                            cfg.border
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full shrink-0 animate-pulse",
                              cfg.dot
                            )}
                          />
                          {cfg.label}
                        </span>
                      </TableCell>

                      {/* Source */}
                      <TableCell className="py-3.5 hidden md:table-cell">
                        <span className="text-[11px] font-bold text-muted-foreground capitalize">
                          {lead.source?.replace(/_/g, " ") || "—"}
                        </span>
                      </TableCell>

                      {/* Trip */}
                      <TableCell className="py-3.5 hidden lg:table-cell">
                        <span className="text-[11px] font-bold text-muted-foreground/60 capitalize max-w-[120px] truncate block">
                          {lead.trip_slug?.replace(/-/g, " ") || "—"}
                        </span>
                      </TableCell>

                      {/* Owner */}
                      <TableCell className="py-3.5 hidden xl:table-cell">
                        <Badge variant="outline" className="font-bold text-[9px] uppercase border-border bg-muted/50 text-muted-foreground h-5">
                          {lead.owner_name?.split(" ")[0] || "Unassigned"}
                        </Badge>
                      </TableCell>

                      {/* Next follow-up */}
                      <TableCell className="py-3.5 hidden xl:table-cell">
                        <div className="flex flex-col">
                           <span className={cn(
                             "text-[11px] font-bold",
                             lead.next_follow_up_at && new Date(lead.next_follow_up_at) < new Date() ? "text-rose-600" : "text-muted-foreground"
                           )}>
                             {lead.next_follow_up_at
                               ? (mounted ? formatDistanceToNow(new Date(lead.next_follow_up_at), { addSuffix: true }) : "...")
                               : "Not scheduled"}
                           </span>
                           {lead.last_follow_up_at && (
                             <span className="text-[9px] text-muted-foreground/60 font-medium tracking-tight">
                               last activity {mounted ? formatDistanceToNow(new Date(lead.last_follow_up_at), { addSuffix: true }) : "..."}
                             </span>
                           )}
                        </div>
                      </TableCell>

                      {/* Age */}
                      <TableCell className="py-3.5 text-right pr-2 hidden xl:table-cell">
                        <span className="text-[11px] font-bold text-muted-foreground/30 tabular-nums uppercase">
                          {mounted ? formatDistanceToNow(new Date(lead.created_at), { addSuffix: false }) : "..."}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3.5 text-center pr-6 md:pr-8 w-[60px]">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-muted data-[state=open]:bg-muted rounded-lg group/btn shadow-none border-none"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="size-4 text-muted-foreground group-hover/btn:text-foreground transition-colors" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px] rounded-xl shadow-2xl border-border bg-card p-1.5 animate-in fade-in zoom-in-95 duration-100">
                            <DropdownMenuLabel className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-1">Quick Actions</DropdownMenuLabel>
                            <DropdownMenuItem 
                              className="cursor-pointer text-xs font-bold rounded-lg focus:bg-muted px-2 py-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`${baseRoute}/${lead.id}`);
                              }}
                            >
                              <Eye className="mr-2 size-3.5" />
                              Open Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="cursor-pointer text-xs font-bold rounded-lg focus:bg-muted px-2 py-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                if(lead.phone) { 
                                  navigator.clipboard.writeText(lead.phone); 
                                  toast.success("Phone number copied");
                                }
                              }}
                            >
                              <Phone className="mr-2 size-3.5" />
                              Copy Phone
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-muted mx-1my-1" />
                            <DropdownMenuItem 
                              className="cursor-pointer text-xs font-bold text-rose-600 focus:bg-rose-500/10 focus:text-rose-700 rounded-lg px-2 py-2"
                              onClick={(e) => {
                                e.stopPropagation();
                                toast.promise(new Promise(res => setTimeout(res, 800)), {
                                  loading: "Flagging lead...",
                                  success: "Lead flagged for manager review",
                                });
                              }}
                            >
                              <TriangleAlert className="mr-2 size-3.5" />
                              Flag for Manager
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Advanced Pagination Navigation */}
          <div className="px-6 py-4 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between bg-card/30 backdrop-blur-sm shrink-0 gap-4">
            <div className="flex items-center gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Coverage</span>
                <span className="text-[11px] font-bold text-foreground tabular-nums">
                  {total} <span className="text-muted-foreground/60 font-medium">Record{total !== 1 ? "s" : ""}</span>
                </span>
              </div>
              
              <div className="h-8 w-px bg-border/40" />

              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-1">Density</span>
                <Select 
                  value={String(pageSize)} 
                  onValueChange={(val) => {
                    const params = new URLSearchParams(window.location.search);
                    params.set("pageSize", val);
                    params.set("page", "1");
                    router.push(`${baseRoute}?${params.toString()}`);
                  }}
                >
                  <SelectTrigger className="h-6 w-[70px] border-none bg-transparent p-0 text-[11px] font-bold focus:ring-0 shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/50">
                    <SelectItem value="20" className="text-[11px] font-bold">20 / pg</SelectItem>
                    <SelectItem value="50" className="text-[11px] font-bold">50 / pg</SelectItem>
                    <SelectItem value="100" className="text-[11px] font-bold">100 / pg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-4">
                {/* Page Number Strip */}
                <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-xl">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background"
                    disabled={page <= 1}
                    onClick={() => navigate({ page: page - 1 })}
                  >
                    <ChevronLeft className="size-3.5" />
                  </Button>

                  <div className="flex items-center px-1">
                    {[...Array(totalPages)].map((_, i) => {
                      const p = i + 1;
                      // Show first, last, current, and neighbors
                      if (
                        p === 1 ||
                        p === totalPages ||
                        (p >= page - 1 && p <= page + 1)
                      ) {
                        return (
                          <Button
                            key={p}
                            variant={page === p ? "secondary" : "ghost"}
                            size="sm"
                            className={cn(
                              "h-7 min-w-[28px] px-1.5 rounded-lg text-[11px] font-bold tabular-nums transition-all",
                              page === p ? "bg-background shadow-sm text-primary" : "text-muted-foreground/60 hover:text-foreground"
                            )}
                            onClick={() => navigate({ page: p })}
                          >
                            {p}
                          </Button>
                        );
                      }
                      // Ellipses
                      if (p === 2 || p === totalPages - 1) {
                        return <span key={p} className="text-[10px] text-muted-foreground/30 px-1 font-bold">···</span>;
                      }
                      return null;
                    })}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground hover:bg-background"
                    disabled={page >= totalPages}
                    onClick={() => navigate({ page: page + 1 })}
                  >
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>

                <div className="h-8 w-px bg-border/40 hidden sm:block" />

                {/* Direct Jump */}
                <div className="flex items-center gap-2 group">
                  <span className="text-[10px] font-bold text-muted-foreground/30 uppercase tracking-widest hidden lg:block group-hover:text-muted-foreground/60 transition-colors">Jump to</span>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      defaultValue={page}
                      key={page}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const val = parseInt((e.target as HTMLInputElement).value);
                          if (!isNaN(val)) navigate({ page: Math.max(1, Math.min(val, totalPages)) });
                        }
                      }}
                      className="h-8 w-14 rounded-xl border border-border/50 bg-background text-center text-[11px] font-extrabold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}


      </CardContent>
    </Card>
  );
}
