"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Clock, Send } from "lucide-react";

import { requestTimeOff, requestWeeklyOff } from "@/lib/actions/attendance";
import type { AttendanceLog, TimeOffRequest, WeeklyOffRequest } from "@/types/attendance";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ATTENDANCE_RANGES = [
  { value: "1w", label: "This week" },
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "1y", label: "1 year" },
  { value: "custom", label: "Custom" },
] as const;

type AttendanceRange = (typeof ATTENDANCE_RANGES)[number]["value"];

function getCurrentMonthWeekStarts() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const starts: { value: string; label: string }[] = [];
  const cursor = new Date(year, month, 1);

  const toDateKey = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  while (cursor.getMonth() === month) {
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const normalizedEnd = new Date(Math.min(weekEnd.getTime(), new Date(year, month + 1, 0).getTime()));

    const value = toDateKey(cursor);
    const label = `${cursor.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    })} - ${normalizedEnd.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;

    starts.push({ value, label });
    cursor.setDate(cursor.getDate() + 7);
  }

  return starts;
}

export function AttendanceBoard({
  timeline,
  timeOffRequests,
  weeklyOffRequests,
  currentUserId,
  initialRange,
  initialFrom,
  initialTo,
  agentOptions = [],
  initialAgent = "all",
}: {
  timeline: AttendanceLog[];
  timeOffRequests: TimeOffRequest[];
  weeklyOffRequests: WeeklyOffRequest[];
  currentUserId: string;
  initialRange: AttendanceRange;
  initialFrom: string;
  initialTo: string;
  agentOptions?: Array<{ id: string; name: string }>;
  initialAgent?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isNavPending, startNavTransition] = useTransition();

  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  const monthWeekStarts = useMemo(() => getCurrentMonthWeekStarts(), []);
  const [weekStart, setWeekStart] = useState(() => monthWeekStarts[0]?.value || "");
  const [weekDay, setWeekDay] = useState("0");
  const [weeklyReason, setWeeklyReason] = useState("");

  const [rangeValue, setRangeValue] = useState<AttendanceRange>(initialRange);
  const [customFrom, setCustomFrom] = useState(initialFrom);
  const [customTo, setCustomTo] = useState(initialTo);
  const [agentFilter, setAgentFilter] = useState(initialAgent);

  const summary = useMemo(() => {
    const totalHours = timeline.reduce((sum, row) => sum + Number(row.total_hours || 0), 0);
    const presentDays = timeline.filter((row) => row.status === "present").length;
    const compliantDays = timeline.filter((row) => Number(row.total_hours || 0) >= 8).length;

    const totalBreakMinutes = timeline.reduce((sum, row) => {
      const breaks = row.breaks || [];
      const minutes = breaks.reduce((acc, entry) => {
        if (!entry.start || !entry.end) return acc;
        const start = new Date(entry.start).getTime();
        const end = new Date(entry.end).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) return acc;
        return acc + Math.max(0, Math.floor((end - start) / 60000));
      }, 0);
      return sum + minutes;
    }, 0);

    return {
      totalHours: Number(totalHours.toFixed(1)),
      presentDays,
      compliantDays,
      totalBreakMinutes,
    };
  }, [timeline]);

  const showAgentColumn = useMemo(() => {
    if (agentOptions.length > 0 && agentFilter === "all") return true;
    return new Set(timeline.map((row) => row.agent_id)).size > 1;
  }, [agentFilter, agentOptions.length, timeline]);

  const applyRange = (nextRange: AttendanceRange, nextFrom?: string, nextTo?: string, nextAgent?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", nextRange);

    const agent = nextAgent ?? agentFilter;
    if (agent && agent !== "all") params.set("agent", agent);
    else params.delete("agent");

    if (nextRange === "custom") {
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
    } else {
      params.delete("from");
      params.delete("to");
    }

    startNavTransition(() => {
      router.push(`/dashboard/attendance?${params.toString()}`);
    });
  };

  const handleLeaveRequest = () => {
    if (!leaveDate) {
      toast.error("Select a leave date");
      return;
    }

    startTransition(async () => {
      try {
        await requestTimeOff(currentUserId, leaveDate, leaveReason || "Leave request");
        setLeaveReason("");
        setLeaveDate("");
        toast.success("Leave request submitted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to submit leave request");
      }
    });
  };

  const handleWeeklyOffRequest = () => {
    if (!weekStart) {
      toast.error("Select the week start date");
      return;
    }

    startTransition(async () => {
      try {
        await requestWeeklyOff({
          requestedWeekStart: weekStart,
          requestedDayOfWeek: Number.parseInt(weekDay, 10),
          reason: weeklyReason || undefined,
        });
        setWeeklyReason("");
        setWeekStart("");
        toast.success("Weekly off request submitted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to submit weekly off request");
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 py-6 lg:py-8 px-4 lg:px-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Net Hours</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.totalHours}h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Present Days</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.presentDays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">8h Compliant</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.compliantDays}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Break Minutes</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{summary.totalBreakMinutes}m</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="session" className="space-y-4">
        <TabsList className="grid w-full max-w-[320px] grid-cols-2">
          <TabsTrigger value="session">Session History</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="session" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/50 pb-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="text-base">Session History</CardTitle>
                  <CardDescription>
                    Week is the default view. Switch to longer windows when auditing historical trends.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={rangeValue}
                    onValueChange={(value) => {
                      const next = value as AttendanceRange;
                      setRangeValue(next);
                      if (next !== "custom") {
                        applyRange(next);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTENDANCE_RANGES.map((range) => (
                        <SelectItem key={range.value} value={range.value} className="text-xs">
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {agentOptions.length > 0 ? (
                    <Select
                      value={agentFilter}
                      onValueChange={(value) => {
                        setAgentFilter(value);
                        applyRange(rangeValue, customFrom, customTo, value);
                      }}
                    >
                      <SelectTrigger className="h-9 w-[180px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All agents</SelectItem>
                        {agentOptions.map((agent) => (
                          <SelectItem key={agent.id} value={agent.id}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}

                  {rangeValue === "custom" ? (
                    <>
                      <Input
                        type="date"
                        className="h-9 w-[150px] text-xs"
                        value={customFrom}
                        onChange={(event) => setCustomFrom(event.target.value)}
                      />
                      <Input
                        type="date"
                        className="h-9 w-[150px] text-xs"
                        value={customTo}
                        onChange={(event) => setCustomTo(event.target.value)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        disabled={!customFrom || !customTo || isNavPending}
                        onClick={() => applyRange("custom", customFrom, customTo)}
                      >
                        Apply
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/20">
                    <TableRow>
                      <TableHead className="pl-6">Work Date</TableHead>
                      {showAgentColumn ? <TableHead>Agent</TableHead> : null}
                      <TableHead>Hours Logged</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead className="pr-6 text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timeline.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={showAgentColumn ? 5 : 4} className="h-36 text-center">
                          <Clock className="mx-auto mb-2 size-6 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">No attendance entries for this range.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      timeline.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="pl-6 text-sm font-medium">{row.work_date}</TableCell>
                          {showAgentColumn ? <TableCell className="text-xs text-muted-foreground">{row.agent_name || "Agent"}</TableCell> : null}
                          <TableCell className="text-sm font-semibold tabular-nums">{(row.total_hours || 0).toFixed(2)}h</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.clock_in
                              ? new Date(row.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : "-"}
                            <span className="mx-2">/</span>
                            {row.clock_out
                              ? new Date(row.clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                              : "-"}
                          </TableCell>
                          <TableCell className="pr-6 text-right">
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-[10px] uppercase",
                                row.status === "present" && "bg-emerald-500/10 text-emerald-600",
                                row.status !== "present" && "bg-rose-500/10 text-rose-600"
                              )}
                            >
                              {row.status.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Request Time Off</CardTitle>
                <CardDescription>Submit leave request with date and context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Leave date</Label>
                  <Input type="date" value={leaveDate} onChange={(event) => setLeaveDate(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Reason</Label>
                  <Textarea
                    value={leaveReason}
                    onChange={(event) => setLeaveReason(event.target.value)}
                    placeholder="Briefly explain your request"
                    className="min-h-[88px] resize-none"
                  />
                </div>
                <Button className="w-full" onClick={handleLeaveRequest} disabled={isPending}>
                  {isPending ? "Submitting..." : "Submit request"}
                  <Send className="size-3.5" />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Set Week Off Preference</CardTitle>
                <CardDescription>Choose one week and your preferred day in the current month.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Week window</Label>
                  <Select value={weekStart} onValueChange={setWeekStart}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select week" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthWeekStarts.map((week) => (
                        <SelectItem key={week.value} value={week.value}>
                          {week.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Preferred day</Label>
                  <Select value={weekDay} onValueChange={setWeekDay}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Reason (optional)</Label>
                  <Input value={weeklyReason} onChange={(event) => setWeeklyReason(event.target.value)} placeholder="Add context" />
                </div>

                <Button variant="outline" className="w-full" onClick={handleWeeklyOffRequest} disabled={isPending || !weekStart}>
                  Update preference
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Time Off Requests</CardTitle>
              <CardDescription>Track status and submission history in table view.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeOffRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">
                        No time-off requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    timeOffRequests.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.requested_date}</TableCell>
                        <TableCell className="max-w-[420px] text-sm">{row.reason || "No reason shared"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Week Off Requests</CardTitle>
              <CardDescription>Review preferred weekly offs and approvals in one table.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week start</TableHead>
                    <TableHead>Requested day</TableHead>
                    <TableHead>Approved day</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeklyOffRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                        No weekly off requests found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    weeklyOffRequests.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.requested_week_start}</TableCell>
                        <TableCell>{DAYS[row.requested_day_of_week]}</TableCell>
                        <TableCell>{typeof row.approved_day_of_week === "number" ? DAYS[row.approved_day_of_week] : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{row.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
