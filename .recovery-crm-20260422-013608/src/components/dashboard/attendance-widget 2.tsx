"use client";

import { useEffect, useState } from "react";
import { getTodayAttendance, clockIn, startBreak, endBreak, clockOut } from "@/lib/actions/attendance";
import { AttendanceLog, BreakLog, LocationType } from "@/types/attendance";
import { Button } from "@/components/ui/button";
import { Clock, Coffee, Play, Pause, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function AttendanceWidget({ agentId }: { agentId: string }) {
  const [log, setLog] = useState<AttendanceLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    getTodayAttendance(agentId).then((data) => {
      setLog(data);
      setLoading(false);
    });

    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, [agentId]);

  if (loading) return <div className="h-8 w-24 bg-zinc-100 animate-pulse rounded-md" />;

  const isClockedIn = !!log?.clock_in;
  const activeBreak = log?.breaks.find((b) => !b.end);

  const calculateTotalSeconds = (startMs: number, endMs: number) => Math.max(0, Math.floor((endMs - startMs) / 1000));

  let totalWorkSeconds = 0;
  let totalBreakSeconds = 0;

  if (isClockedIn) {
    const clockInTime = new Date(log.clock_in!).getTime();
    const endTime = log.clock_out ? new Date(log.clock_out).getTime() : now.getTime();
    const grossSeconds = calculateTotalSeconds(clockInTime, endTime);

    log.breaks.forEach((b: BreakLog) => {
      const bStart = new Date(b.start).getTime();
      const bEnd = b.end ? new Date(b.end).getTime() : endTime;
      totalBreakSeconds += calculateTotalSeconds(bStart, bEnd);
    });

    totalWorkSeconds = Math.max(0, grossSeconds - totalBreakSeconds);
  }

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleClockIn = async (location: LocationType) => {
    try {
      const newLog = await clockIn(agentId, location);
      setLog(newLog);
    } catch (error) {
      console.error(error);
    }
  };

  const handleToggleBreak = async () => {
    try {
      if (activeBreak) {
        const newLog = await endBreak(agentId);
        setLog(newLog);
      } else {
        const newLog = await startBreak(agentId);
        setLog(newLog);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleEndShift = async () => {
    try {
      const updated = await clockOut(agentId);
      setLog(updated);
    } catch (error) {
      console.error(error);
    }
  };

  if (!isClockedIn) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" onClick={() => handleClockIn('WFO')}>
          Clock In (WFO)
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" onClick={() => handleClockIn('WFH')}>
          Clock In (WFH)
        </Button>
      </div>
    );
  }

  const isBreakOverLimit = totalBreakSeconds > 30 * 60;

  return (
    <div className="flex items-center gap-3">
      {/* Work Timer */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 border border-border rounded-lg">
        <Clock className={cn("size-3", activeBreak ? "text-muted-foreground/40" : "text-emerald-500")} />
        <span className={cn("font-mono font-bold text-[11px]", activeBreak ? "text-muted-foreground" : "text-foreground")}>
          {formatTime(totalWorkSeconds)}
        </span>
      </div>

      {/* Break Timer & Actions */}
      {activeBreak ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("px-2.5 py-1 gap-1.5 rounded-lg border shadow-none", isBreakOverLimit ? "bg-rose-500/10 text-rose-500 border-rose-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20")}>
            <Coffee className="size-3" />
            <span className="font-mono font-bold text-[11px]">{formatTime(totalBreakSeconds)}</span>
          </Badge>
          <Button variant="secondary" size="sm" className="h-8 shadow-none text-[11px] font-bold bg-muted hover:bg-muted/80" onClick={handleToggleBreak}>
            <Play className="size-3 mr-1" /> Resume Work
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold" onClick={handleEndShift}>
            <LogOut className="size-3 mr-1" /> End Shift
          </Button>
        </div>
      ) : (
        <>
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold border-border hover:bg-muted" onClick={handleToggleBreak}>
            <Pause className="size-3 mr-1" /> Start Break
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px] font-bold border-border hover:bg-muted" onClick={handleEndShift}>
            <LogOut className="size-3 mr-1" /> End Shift
          </Button>
        </>
      )}
    </div>
  );
}
