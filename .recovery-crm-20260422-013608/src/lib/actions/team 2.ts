"use server";

import { createClient } from "@/lib/supabase/server";
import { type AttendanceLog } from "@/types/attendance";
import { isManagerRole } from "@/types/roles";

export interface TeamMemberStatus {
  id: string;
  full_name: string;
  email: string;
  role: string;
  attendance: AttendanceLog | null;
  active_leads_count: number;
  escalated_leads_count: number;
  overdue_followups_count: number;
}

interface SupabaseQueryError {
  code?: string;
  message?: string;
}

function isSchemaMismatch(error: SupabaseQueryError | null | undefined) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST205" || /does not exist/i.test(error.message || "");
}

interface LeadSummaryRow {
  id: string;
  allotted_to: string | null;
  crm_status: string;
  next_follow_up_at: string | null;
  escalated_at: string | null;
}

function hoursFromLog(log: AttendanceLog | null) {
  if (!log?.clock_in) return 0;

  const now = Date.now();
  const clockInTime = new Date(log.clock_in).getTime();
  const endTime = log.clock_out ? new Date(log.clock_out).getTime() : now;

  const breakMs = (log.breaks || []).reduce((sum, entry) => {
    const start = new Date(entry.start).getTime();
    const end = entry.end ? new Date(entry.end).getTime() : now;
    return sum + Math.max(0, end - start);
  }, 0);

  const gross = Math.max(0, endTime - clockInTime);
  return Number(((gross - breakMs) / (1000 * 60 * 60)).toFixed(2));
}

export async function getTeamMonitor() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data: myProfile } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .single();

  if (!myProfile || myProfile.status !== "active") {
    throw new Error("Profile not active");
  }

  if (!isManagerRole(myProfile.role)) {
    throw new Error("Only managers/admin can access team monitor");
  }

  const today = new Date().toISOString().split("T")[0];
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ data: profiles, error: pError }, { data: attendanceLogs, error: aError }, { data: leads, error: lError }] =
    await Promise.all([
      supabase
        .schema("crm")
        .from("profiles")
        .select("id, full_name, email, role")
        .in("role", ["sales_agent", "sales_manager", "operations_manager"])
        .eq("status", "active"),
      supabase.from("attendance_logs").select("*").eq("work_date", today),
      supabase
        .from("leads")
        .select("id, allotted_to, crm_status, next_follow_up_at, escalated_at")
        .not("allotted_to", "is", null),
    ]);

  if (pError || !profiles) throw new Error("Failed to fetch profiles");
  if (aError && !isSchemaMismatch(aError as SupabaseQueryError)) throw new Error("Failed to fetch attendance");
  if (lError && !isSchemaMismatch(lError as SupabaseQueryError)) throw new Error("Failed to fetch leads counts");

  const safeAttendanceLogs = isSchemaMismatch(aError as SupabaseQueryError) ? [] : (attendanceLogs || []);
  const safeLeads = isSchemaMismatch(lError as SupabaseQueryError) ? [] : (leads || []);

  const monitorData: TeamMemberStatus[] = profiles.map((profile) => {
    const logs = safeAttendanceLogs as AttendanceLog[];
    const leadRows = safeLeads as LeadSummaryRow[];
    const log = logs.find((entry) => entry.agent_id === profile.id) || null;

    const mine = leadRows.filter((lead) => lead.allotted_to === profile.id);
    const activeLeadCount = mine.filter((lead) => !["won", "dropped", "archived"].includes(lead.crm_status)).length;
    const escalated = mine.filter((lead) => Boolean(lead.escalated_at)).length;
    const overdue = mine.filter(
      (lead) =>
        lead.next_follow_up_at &&
        new Date(lead.next_follow_up_at).getTime() < startOfDay.getTime() &&
        !["won", "dropped", "archived"].includes(lead.crm_status)
    ).length;

    return {
      id: profile.id,
      full_name: profile.full_name || "Agent",
      email: profile.email || "",
      role: profile.role,
      attendance: log
        ? {
            ...log,
            total_hours: hoursFromLog(log),
          }
        : null,
      active_leads_count: activeLeadCount,
      escalated_leads_count: escalated,
      overdue_followups_count: overdue,
    };
  });

  return monitorData;
}
