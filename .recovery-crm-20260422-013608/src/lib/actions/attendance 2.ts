"use server";

import { createClient } from "@/lib/supabase/server";
import type { AttendanceLog, BreakLog, LocationType, TimeOffRequest, WeeklyOffRequest } from "@/types/attendance";
import { isManagerRole, type CRMRole } from "@/types/roles";

interface CurrentIdentity {
  userId: string;
  role: CRMRole;
  fullName: string;
}

interface SupabaseQueryError {
  code?: string;
  message?: string;
}

function isSchemaMismatch(error: SupabaseQueryError | null | undefined) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST205" || /does not exist/i.test(error.message || "");
}

function calcSeconds(startIso: string, endIso: string) {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function computeNetHours(log: AttendanceLog) {
  if (!log.clock_in) return 0;
  const endAt = log.clock_out || new Date().toISOString();
  const grossSeconds = calcSeconds(log.clock_in, endAt);
  const breakSeconds = (log.breaks || []).reduce((total, entry) => {
    if (!entry.start) return total;
    const breakEnd = entry.end || endAt;
    return total + calcSeconds(entry.start, breakEnd);
  }, 0);

  return Math.max(0, (grossSeconds - breakSeconds) / 3600);
}

async function getIdentity(): Promise<CurrentIdentity> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data: profile } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status !== "active") {
    throw new Error("Profile is not active");
  }

  return {
    userId: user.id,
    role: profile.role as CRMRole,
    fullName: profile.full_name as string,
  };
}

async function canAccessAgentAttendance(requestedAgentId: string) {
  const identity = await getIdentity();
  if (identity.userId === requestedAgentId || isManagerRole(identity.role)) {
    return identity;
  }
  throw new Error("Forbidden");
}

async function sendBreakAlert(agentId: string, agentName: string, workDate: string, breakMinutes: number) {
  const supabase = await createClient();

  const { data: managers } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id")
    .in("role", ["admin", "operations_manager", "sales_manager"])
    .eq("status", "active");

  if (!managers?.length) return;

  const link = `/dashboard/attendance?agent=${agentId}&date=${workDate}`;
  const managerIds = managers.filter((row) => row.id !== agentId).map((row) => row.id as string);

  if (managerIds.length === 0) return;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: existing } = await supabase
    .schema("crm")
    .from("notifications")
    .select("user_id")
    .eq("title", "Break limit exceeded")
    .eq("link", link)
    .gte("created_at", startOfDay.toISOString())
    .in("user_id", managerIds);

  const existingIds = new Set((existing || []).map((row) => row.user_id as string));

  const payload = managers
    .filter((row) => row.id !== agentId && !existingIds.has(row.id as string))
    .map((manager) => ({
      user_id: manager.id,
      title: "Break limit exceeded",
      body: `${agentName} exceeded 30 minutes break (${breakMinutes}m).`,
      type: "warning",
      link,
      send_email: false,
    }));

  if (payload.length > 0) {
    await supabase.schema("crm").from("notifications").insert(payload);
  }
}

// 1. Get today's attendance for an agent
export async function getTodayAttendance(agentId: string): Promise<AttendanceLog | null> {
  const identity = await canAccessAgentAttendance(agentId);
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("attendance_logs")
    .select("*")
    .eq("agent_id", agentId)
    .eq("work_date", today)
    .maybeSingle();

  if (error) {
    console.error("Error fetching today attendance:", error);
    return null;
  }

  if (!data) return null;

  const log = data as AttendanceLog;

  // Soft break threshold: if active break exceeds 30m, manager gets in-app alert.
  const activeBreak = log.breaks?.find((entry) => !entry.end);
  if (activeBreak) {
    const breakMinutes = Math.floor(calcSeconds(activeBreak.start, new Date().toISOString()) / 60);
    if (breakMinutes > 30) {
      let agentName = identity.fullName;
      if (identity.userId !== log.agent_id) {
        const { data: agentProfile } = await supabase
          .schema("crm")
          .from("profiles")
          .select("full_name")
          .eq("id", log.agent_id)
          .single();
        agentName = (agentProfile?.full_name as string) || "Agent";
      }

      await sendBreakAlert(log.agent_id, agentName, log.work_date, breakMinutes);
    }
  }

  return {
    ...log,
    total_hours: Number(computeNetHours(log).toFixed(2)),
  } as AttendanceLog;
}

// 2. Clock In
export async function clockIn(agentId: string, locationType: LocationType) {
  await canAccessAgentAttendance(agentId);

  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const existing = await getTodayAttendance(agentId);
  if (existing?.clock_in) {
    return existing;
  }

  const { data, error } = await supabase
    .from("attendance_logs")
    .insert({
      agent_id: agentId,
      work_date: today,
      location_type: locationType,
      clock_in: new Date().toISOString(),
      breaks: [],
      status: "present",
    })
    .select("*")
    .single();

  if (error) {
    console.error("Error clocking in:", error);
    throw new Error("Failed to clock in");
  }

  return data as AttendanceLog;
}

// 3. Start Break
export async function startBreak(agentId: string) {
  const identity = await canAccessAgentAttendance(agentId);
  const supabase = await createClient();
  const log = await getTodayAttendance(agentId);

  if (!log) throw new Error("Not clocked in today");
  if (log.clock_out) throw new Error("Already clocked out");

  const activeBreak = log.breaks.find((entry) => !entry.end);
  if (activeBreak) throw new Error("Already on a break");

  const newBreak: BreakLog = {
    type: "break",
    start: new Date().toISOString(),
  };

  const updatedBreaks = [...log.breaks, newBreak];

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({ breaks: updatedBreaks, updated_at: new Date().toISOString() })
    .eq("id", log.id)
    .select("*")
    .single();

  if (error) throw error;

  // Soft-limit manager signal is emitted when fetching attendance if break goes beyond 30m.
  void identity;
  return data as AttendanceLog;
}

// 4. End Break
export async function endBreak(agentId: string) {
  const identity = await canAccessAgentAttendance(agentId);
  const supabase = await createClient();
  const log = await getTodayAttendance(agentId);

  if (!log) throw new Error("Not clocked in today");

  let exceeded = false;
  const nowIso = new Date().toISOString();

  const updatedBreaks = log.breaks.map((entry) => {
    if (!entry.end) {
      const minutes = Math.floor(calcSeconds(entry.start, nowIso) / 60);
      if (minutes > 30) exceeded = true;
      return { ...entry, end: nowIso };
    }
    return entry;
  });

  const totalHours = Number(computeNetHours({ ...log, breaks: updatedBreaks }).toFixed(2));

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({
      breaks: updatedBreaks,
      total_hours: totalHours,
      updated_at: nowIso,
    })
    .eq("id", log.id)
    .select("*")
    .single();

  if (error) throw error;

  if (exceeded) {
    await sendBreakAlert(agentId, identity.fullName, log.work_date, 31);
  }

  return data as AttendanceLog;
}

export async function clockOut(agentId: string) {
  await canAccessAgentAttendance(agentId);
  const supabase = await createClient();
  const log = await getTodayAttendance(agentId);

  if (!log || !log.clock_in) {
    throw new Error("No active shift found");
  }
  if (log.clock_out) {
    return log;
  }

  const nowIso = new Date().toISOString();
  const updatedBreaks = (log.breaks || []).map((entry) => (entry.end ? entry : { ...entry, end: nowIso }));
  const totalHours = Number(
    computeNetHours({
      ...log,
      breaks: updatedBreaks,
      clock_out: nowIso,
    }).toFixed(2)
  );

  const { data, error } = await supabase
    .from("attendance_logs")
    .update({
      breaks: updatedBreaks,
      clock_out: nowIso,
      total_hours: totalHours,
      status: "present",
      updated_at: nowIso,
    })
    .eq("id", log.id)
    .select("*")
    .single();

  if (error) throw error;
  return data as AttendanceLog;
}

export async function requestTimeOff(agentId: string, requestedDate: string, reason: string) {
  await canAccessAgentAttendance(agentId);
  const supabase = await createClient();

  const { error } = await supabase.from("time_off_requests").insert({
    agent_id: agentId,
    requested_date: requestedDate,
    reason,
    status: "pending",
  });

  if (error) throw error;
  return true;
}

export async function requestWeeklyOff(params: {
  requestedWeekStart: string;
  requestedDayOfWeek: number;
  reason?: string;
}) {
  const identity = await getIdentity();
  const supabase = await createClient();

  const { error } = await supabase.schema("crm").from("weekly_off_requests").insert({
    user_id: identity.userId,
    requested_week_start: params.requestedWeekStart,
    requested_day_of_week: params.requestedDayOfWeek,
    reason: params.reason || null,
    status: "pending",
  });

  if (error) throw new Error(error.message);
  return true;
}

export async function getWeeklyOffRequests(): Promise<WeeklyOffRequest[]> {
  const identity = await getIdentity();
  const supabase = await createClient();

  let query = supabase
    .schema("crm")
    .from("weekly_off_requests")
    .select("id, user_id, requested_week_start, requested_day_of_week, approved_day_of_week, reason, status, reviewer_id, reviewed_at, created_at")
    .order("created_at", { ascending: false });

  if (!isManagerRole(identity.role)) {
    query = query.eq("user_id", identity.userId);
  }

  const { data, error } = await query;
  if (error) {
    if (isSchemaMismatch(error as SupabaseQueryError)) return [];
    throw new Error(error.message);
  }

  return (data || []) as WeeklyOffRequest[];
}

export async function getAttendanceTimeline(params?: {
  dateFrom?: string;
  dateTo?: string;
  agentId?: string;
  limit?: number;
}): Promise<AttendanceLog[]> {
  const identity = await getIdentity();
  const supabase = await createClient();

  const dynamicLimit =
    params?.limit ??
    (params?.dateFrom || params?.dateTo ? 520 : 60);

  let query = supabase
    .from("attendance_logs")
    .select("id, agent_id, work_date, location_type, clock_in, clock_out, breaks, total_hours, status")
    .order("work_date", { ascending: false })
    .limit(dynamicLimit);

  if (params?.dateFrom) query = query.gte("work_date", params.dateFrom);
  if (params?.dateTo) query = query.lte("work_date", params.dateTo);

  if (isManagerRole(identity.role)) {
    if (params?.agentId) query = query.eq("agent_id", params.agentId);
  } else {
    query = query.eq("agent_id", identity.userId);
  }

  const { data, error } = await query;
  if (error) {
    if (isSchemaMismatch(error as SupabaseQueryError)) return [];
    throw new Error(error.message);
  }

  const rows = (data || []) as AttendanceLog[];
  const ids = Array.from(new Set(rows.map((row) => row.agent_id)));

  let namesById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .schema("crm")
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);

    namesById = new Map((profiles || []).map((row) => [row.id as string, (row.full_name as string) || "Agent"]));
  }

  return rows.map((row) => ({
    ...row,
    total_hours: Number(computeNetHours(row).toFixed(2)),
    agent_name: namesById.get(row.agent_id) || "Agent",
  }));
}

export async function getTimeOffRequests(): Promise<TimeOffRequest[]> {
  const identity = await getIdentity();
  const supabase = await createClient();

  let query = supabase
    .from("time_off_requests")
    .select("id, agent_id, requested_date, reason, status, manager_id, created_at")
    .order("created_at", { ascending: false });

  if (!isManagerRole(identity.role)) {
    query = query.eq("agent_id", identity.userId);
  }

  const { data, error } = await query;
  if (error) {
    if (isSchemaMismatch(error as SupabaseQueryError)) return [];
    throw new Error(error.message);
  }

  const rows = (data || []) as TimeOffRequest[];
  const ids = Array.from(new Set(rows.map((row) => row.agent_id)));

  const { data: profiles } = ids.length
    ? await supabase
        .schema("crm")
        .from("profiles")
        .select("id, full_name")
        .in("id", ids)
    : { data: [] };

  const profileMap = new Map((profiles || []).map((row) => [row.id as string, row.full_name as string]));

  return rows.map((row) => ({
    ...row,
    agent_name: profileMap.get(row.agent_id) || "Agent",
  }));
}
