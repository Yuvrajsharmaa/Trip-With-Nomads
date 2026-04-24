"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRequestContext } from "@/lib/auth/request-context";
import { canAccessTeam, resolveManagerScope } from "@/lib/auth/manager-scope";
import type {
  AdminDashboardInsights,
  AgentDashboardInsights,
  ClosedLeadsMetrics,
  ClosedLeadsRange,
  DashboardPipelineBreakdown,
  DashboardPipelineStageKey,
  DueTask,
  ManagerDashboardInsights,
  UnifiedTaskItem,
} from "@/types/dashboard";
import type { Lead, LeadStatus } from "@/types/leads";
import type { CRMRole } from "@/types/roles";
import { isManagerRole } from "@/types/roles";
import type { AssignableAgent, PendingUserApproval, PendingWeeklyOffApproval } from "@/types/crm-core";
import { logLeadActivity } from "@/lib/actions/lead-activity";
import { buildAgentInsightsFromLeads } from "@/lib/dashboard/agent-insights";
import type { TaskPriority, TaskStatus } from "@/types/tasks";

interface ProfileRow {
  id: string;
  full_name: string;
  email: string | null;
  role: CRMRole;
  status: "pending" | "active" | "suspended";
  team_id: string | null;
}

interface DueLeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  trip_slug: string | null;
  crm_status: LeadStatus;
  next_follow_up_at: string | null;
  allotted_to: string | null;
}

interface PendingWeeklyOffRow {
  id: string;
  user_id: string;
  requested_week_start: string;
  requested_day_of_week: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface CrmTaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadLookupRow {
  id: string;
  name: string | null;
  phone: string | null;
  trip_slug: string | null;
  crm_status: LeadStatus;
}

interface SupabaseQueryError {
  code?: string;
  message?: string;
}

const DEBUG_ROLE_ALLOWED_EMAILS = new Set(["yuvrajsharma6367@gmail.com"]);

function isSchemaMismatch(error: SupabaseQueryError | null | undefined) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST205" || /does not exist/i.test(error.message || "");
}

function isMissingFunction(error: SupabaseQueryError | null | undefined) {
  if (!error) return false;
  return error.code === "PGRST202" || /function .* does not exist/i.test(error.message || "");
}

function normalizePhone(input: string | null | undefined) {
  if (!input) return null;
  const normalized = input.replace(/[^0-9]/g, "").trim();
  return normalized.length > 0 ? normalized : null;
}

function inferTripType(value: string | null | undefined) {
  const content = String(value || "").toLowerCase();
  if (!content) return null;
  if (
    content.includes("international") ||
    content.includes("europe") ||
    content.includes("bali") ||
    content.includes("thailand") ||
    content.includes("vietnam")
  ) {
    return "international" as const;
  }
  return "domestic" as const;
}

async function getCurrentProfile() {
  const { supabase, user, profile } = await requireRequestContext();
  return { supabase, user, profile: profile as ProfileRow };
}

async function getProfileMapByIds(ids: string[]) {
  if (ids.length === 0) return new Map<string, { full_name: string; role: CRMRole }>();

  const supabase = await createClient();
  const { data } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, full_name, role")
    .in("id", ids);

  const map = new Map<string, { full_name: string; role: CRMRole }>();
  for (const row of data || []) {
    map.set(row.id as string, {
      full_name: (row.full_name as string) || "Unassigned",
      role: row.role as CRMRole,
    });
  }
  return map;
}

export async function getAssignableAgents(): Promise<AssignableAgent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, full_name, role")
    .eq("status", "active")
    .not("role", "is", null);

  if (error) {
    console.error("Error fetching assignable agents:", error);
    return [];
  }

  return (data || []) as AssignableAgent[];
}

function getRangeBounds(range: ClosedLeadsRange, customStart?: string, customEnd?: string) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  switch (range) {
    case "today":
      start.setHours(0, 0, 0, 0);
      break;
    case "yesterday":
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - 1);
      break;
    case "1w":
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      break;
    case "1m":
      start.setMonth(start.getMonth() - 1);
      break;
    case "3m":
      start.setMonth(start.getMonth() - 3);
      break;
    case "6m":
      start.setMonth(start.getMonth() - 6);
      break;
    case "1y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "custom": {
      const s = customStart ? new Date(customStart) : new Date(now);
      const e = customEnd ? new Date(customEnd) : new Date(now);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }
    default:
      start.setHours(0, 0, 0, 0);
      break;
  }

  return { start, end };
}

function getPriorityRank(priority: TaskPriority) {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function computeUrgencyScore(task: Pick<UnifiedTaskItem, "priority" | "due_at" | "pending_minutes">) {
  const dueMs = task.due_at ? new Date(task.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  const nowMs = Date.now();
  const overdueMinutes = dueMs < nowMs ? Math.round((nowMs - dueMs) / 60000) : 0;
  return getPriorityRank(task.priority) * 100_000 + overdueMinutes * 8 + task.pending_minutes;
}

function sortUnifiedTasks(tasks: UnifiedTaskItem[]) {
  return [...tasks].sort((a, b) => b.urgency_score - a.urgency_score);
}

function mapLeadToDashboardPipelineStage(params: {
  status: LeadStatus;
  allottedTo: string | null;
  includeUnassigned: boolean;
}): DashboardPipelineStageKey | null {
  if (!params.allottedTo) {
    return params.includeUnassigned ? "unassigned" : null;
  }

  if (params.status === "new" || params.status === "claimed") return "claimed";
  if (params.status === "follow_up_1") return "follow_up_1";
  if (params.status === "follow_up_2") return "follow_up_2";
  if (params.status === "follow_up_3") return "follow_up_3";
  if (params.status === "follow_up_4") return "follow_up_4";
  if (params.status === "final_call") return "final_call";

  return null;
}

export async function fetchClosedLeadsMetrics(
  range: ClosedLeadsRange,
  customStart?: string,
  customEnd?: string
): Promise<ClosedLeadsMetrics> {
  const { supabase } = await getCurrentProfile();
  const { start, end } = getRangeBounds(range, customStart, customEnd);

  const [wonResult, droppedResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("crm_status", "won")
      .gte("won_at", start.toISOString())
      .lte("won_at", end.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("crm_status", "dropped")
      .gte("dropped_at", start.toISOString())
      .lte("dropped_at", end.toISOString()),
  ]);

  const won = wonResult.count ?? 0;
  const dropped = droppedResult.count ?? 0;

  return {
    range,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    won,
    dropped,
    total: won + dropped,
  };
}

export async function fetchDashboardInsights(): Promise<ManagerDashboardInsights> {
  const { supabase, profile } = await getCurrentProfile();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  const [activeLeadsResult, wonThisWeek, droppedThisWeek] = await Promise.all([
    supabase
      .from("leads")
      .select("id, source, trip_slug, crm_status, allotted_to, escalated_at, next_follow_up_at")
      .not("crm_status", "in", '("won","dropped","archived")'),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("crm_status", "won")
      .gte("won_at", startOfWeek.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("crm_status", "dropped")
      .gte("dropped_at", startOfWeek.toISOString()),
  ]);

  if (activeLeadsResult.error) {
    if (isSchemaMismatch(activeLeadsResult.error as SupabaseQueryError)) {
      const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
      return {
        open_leads: count || 0,
        my_open_leads: 0,
        unassigned_leads: count || 0,
        escalated_open: 0,
        overdue_followups: 0,
        due_today: 0,
        won_this_week: wonThisWeek.count || 0,
        dropped_this_week: droppedThisWeek.count || 0,
        leads_by_source: {},
        leads_by_location: {},
        pipeline_breakdown: {},
        pipeline_by_owner: [],
      };
    }
    throw new Error(activeLeadsResult.error.message);
  }

  const sourceCounts: Record<string, number> = {};
  const locationCounts: Record<string, number> = {};
  const pipelineBreakdown: DashboardPipelineBreakdown = {};
  const pipelineByOwnerMap = new Map<string, DashboardPipelineBreakdown>();

  let myOpen = 0;
  let unassigned = 0;
  let escalated = 0;
  let dueToday = 0;
  let overdue = 0;

  const activeLeads = (activeLeadsResult.data || []) as {
    source: string | null;
    trip_slug: string | null;
    crm_status: LeadStatus;
    allotted_to: string | null;
    escalated_at: string | null;
    next_follow_up_at: string | null;
  }[];

  for (const lead of activeLeads) {
    const source = lead.source || "Unknown";
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;

    const location = lead.trip_slug || "Other";
    locationCounts[location] = (locationCounts[location] || 0) + 1;

    const stageForGlobal = mapLeadToDashboardPipelineStage({
      status: lead.crm_status,
      allottedTo: lead.allotted_to,
      includeUnassigned: true,
    });
    if (stageForGlobal) {
      pipelineBreakdown[stageForGlobal] = (pipelineBreakdown[stageForGlobal] || 0) + 1;
    }

    if (lead.allotted_to) {
      const stageForOwner = mapLeadToDashboardPipelineStage({
        status: lead.crm_status,
        allottedTo: lead.allotted_to,
        includeUnassigned: false,
      });
      if (stageForOwner) {
        const ownerBreakdown = pipelineByOwnerMap.get(lead.allotted_to) || {};
        ownerBreakdown[stageForOwner] = (ownerBreakdown[stageForOwner] || 0) + 1;
        pipelineByOwnerMap.set(lead.allotted_to, ownerBreakdown);
      }
    }

    if (lead.allotted_to === profile.id) myOpen += 1;
    if (!lead.allotted_to) unassigned += 1;
    if (lead.escalated_at) escalated += 1;

    if (lead.next_follow_up_at) {
      const followUpDate = new Date(lead.next_follow_up_at);
      if (followUpDate >= startOfDay && followUpDate < endOfDay) {
        dueToday += 1;
      } else if (followUpDate < startOfDay) {
        overdue += 1;
      }
    }
  }

  const ownerIds = Array.from(pipelineByOwnerMap.keys());
  const ownerProfiles = await getProfileMapByIds(ownerIds);
  const pipelineByOwner = ownerIds
    .map((ownerId) => {
      const breakdown = pipelineByOwnerMap.get(ownerId) || {};
      const total = Object.values(breakdown).reduce((sum, count) => sum + Number(count || 0), 0);
      return {
        owner_id: ownerId,
        owner_name: ownerProfiles.get(ownerId)?.full_name || "Unknown Agent",
        total,
        pipeline_breakdown: breakdown,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    open_leads: activeLeads.length,
    my_open_leads: myOpen,
    unassigned_leads: unassigned,
    escalated_open: escalated,
    overdue_followups: overdue,
    due_today: dueToday,
    won_this_week: wonThisWeek.count || 0,
    dropped_this_week: droppedThisWeek.count || 0,
    leads_by_source: sourceCounts,
    leads_by_location: locationCounts,
    pipeline_breakdown: pipelineBreakdown,
    pipeline_by_owner: pipelineByOwner,
  };
}

export async function fetchAgentDashboardInsights(): Promise<AgentDashboardInsights> {
  const { supabase, profile } = await getCurrentProfile();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));

  const [activeMineRes, wonRes, droppedRes] = await Promise.all([
    supabase
      .from("leads")
      .select("crm_status,next_follow_up_at,allotted_to")
      .eq("allotted_to", profile.id)
      .not("crm_status", "in", '("won","dropped","archived")'),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("allotted_to", profile.id)
      .eq("crm_status", "won")
      .gte("won_at", startOfWeek.toISOString()),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("allotted_to", profile.id)
      .eq("crm_status", "dropped")
      .gte("dropped_at", startOfWeek.toISOString()),
  ]);

  if (activeMineRes.error) {
    throw new Error(activeMineRes.error.message);
  }

  const base = buildAgentInsightsFromLeads((activeMineRes.data || []) as {
    crm_status: string | null | undefined;
    next_follow_up_at: string | null | undefined;
    allotted_to: string | null | undefined;
  }[]);

  return {
    ...base,
    my_won_this_week: wonRes.count || 0,
    my_dropped_this_week: droppedRes.count || 0,
  };
}

export async function fetchAdminDashboardInsights(): Promise<AdminDashboardInsights> {
  const { supabase, profile } = await getCurrentProfile();
  if (profile.role !== "admin") {
    throw new Error("Only admin can access admin dashboard insights");
  }

  const baseInsights = await fetchDashboardInsights();
  const [pendingUsersResult, pendingWeeklyOffResult] = await Promise.all([
    supabase
      .schema("crm")
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .schema("crm")
      .from("weekly_off_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return {
    open_leads: baseInsights.open_leads,
    my_open_leads: baseInsights.my_open_leads,
    unassigned_leads: baseInsights.unassigned_leads,
    escalated_open: baseInsights.escalated_open,
    overdue_followups: baseInsights.overdue_followups,
    due_today: baseInsights.due_today,
    won_this_week: baseInsights.won_this_week,
    dropped_this_week: baseInsights.dropped_this_week,
    leads_by_source: baseInsights.leads_by_source,
    leads_by_location: baseInsights.leads_by_location,
    pipeline_breakdown: baseInsights.pipeline_breakdown,
    pipeline_by_owner: baseInsights.pipeline_by_owner,
    pending_user_approvals: pendingUsersResult.count || 0,
    pending_weekly_off_approvals: pendingWeeklyOffResult.count || 0,
  };
}

function getTaskPriority(status: LeadStatus, dueAt: string | null) {
  const now = Date.now();
  const dueMs = dueAt ? new Date(dueAt).getTime() : now;
  const isOverdue = dueMs < now;

  if (isOverdue || status === "final_call" || status === "follow_up_4") return "high";
  if (status === "follow_up_3" || status === "follow_up_2") return "medium";
  return "low";
}

export async function fetchDueTasks(limit = 20): Promise<DueTask[]> {
  const { supabase, profile } = await getCurrentProfile();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const taskStatuses: LeadStatus[] = [
    "claimed",
    "follow_up_1",
    "follow_up_2",
    "follow_up_3",
    "follow_up_4",
    "final_call",
  ];

  let query = supabase
    .from("leads")
    .select("id, name, phone, trip_slug, crm_status, next_follow_up_at, allotted_to")
    .in("crm_status", taskStatuses)
    .or(`next_follow_up_at.lt.${endOfDay.toISOString()},next_follow_up_at.is.null`)
    .order("next_follow_up_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (!isManagerRole(profile.role)) {
    query = query.eq("allotted_to", profile.id);
  }

  const { data, error } = await query;

  if (error) {
    if (isSchemaMismatch(error as SupabaseQueryError)) {
      return [];
    }
    console.error("fetchDueTasks error", error);
    return [];
  }

  const dueRows = (data || []) as DueLeadRow[];
  const tasks: DueTask[] = dueRows.map((row) => {
    const dueAt = row.next_follow_up_at || startOfDay.toISOString();
    return {
      id: `lead-${row.id}`,
      lead_id: row.id,
      title: row.name ? `Follow up: ${row.name}` : "Follow up lead",
      due_at: dueAt,
      priority: getTaskPriority(row.crm_status as LeadStatus, row.next_follow_up_at) as
        | "low"
        | "medium"
        | "high",
      status: row.crm_status as LeadStatus,
      lead: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        trip_slug: row.trip_slug,
        crm_status: row.crm_status,
        allotted_to: row.allotted_to,
      },
    };
  });

  return tasks;
}

export async function fetchUnifiedDashboardTasks(params?: {
  limit?: number;
  includeDone?: boolean;
  assigneeOnly?: boolean;
}): Promise<UnifiedTaskItem[]> {
  const { supabase, profile } = await getCurrentProfile();
  const limit = params?.limit ?? 40;
  const includeDone = params?.includeDone ?? false;
  const assigneeOnly = params?.assigneeOnly ?? true;

  const leadStatuses: LeadStatus[] = [
    "claimed",
    "follow_up_1",
    "follow_up_2",
    "follow_up_3",
    "follow_up_4",
    "final_call",
  ];

  const [tasksRes, followupsRes] = await Promise.all([
    (() => {
      let query = supabase
        .schema("crm")
        .from("tasks")
        .select("id,title,description,priority,status,due_at,lead_id,assigned_to,created_by,created_at,updated_at")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (!includeDone) {
        query = query.neq("status", "done");
      }
      if (assigneeOnly || !isManagerRole(profile.role)) {
        query = query.eq("assigned_to", profile.id);
      }

      return query;
    })(),
    (() => {
      let query = supabase
        .from("leads")
        .select("id,name,phone,trip_slug,crm_status,next_follow_up_at,allotted_to,updated_at,created_at")
        .in("crm_status", leadStatuses)
        .or(`next_follow_up_at.lt.${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()},next_follow_up_at.is.null`)
        .order("next_follow_up_at", { ascending: true, nullsFirst: true })
        .limit(limit);

      if (assigneeOnly || !isManagerRole(profile.role)) {
        query = query.eq("allotted_to", profile.id);
      }
      return query;
    })(),
  ]);

  if (tasksRes.error) {
    console.error("fetchUnifiedDashboardTasks tasks error", tasksRes.error);
  }
  if (followupsRes.error) {
    console.error("fetchUnifiedDashboardTasks followups error", followupsRes.error);
  }

  const taskRows = (tasksRes.data ?? []) as CrmTaskRow[];
  const leadRows = (followupsRes.data ?? []) as (DueLeadRow & { updated_at?: string; created_at?: string })[];

  const leadIdsForTasks = Array.from(new Set(taskRows.map((row) => row.lead_id).filter(Boolean))) as string[];
  const assigneeIds = Array.from(
    new Set(taskRows.map((row) => row.assigned_to).filter(Boolean).concat(leadRows.map((row) => row.allotted_to).filter(Boolean)))
  ) as string[];

  const [leadLookupRes, assignees] = await Promise.all([
    leadIdsForTasks.length
      ? supabase
          .from("leads")
          .select("id,name,phone,trip_slug,crm_status")
          .in("id", leadIdsForTasks)
      : Promise.resolve({ data: [] as LeadLookupRow[], error: null }),
    assigneeIds.length ? getProfileMapByIds(assigneeIds) : Promise.resolve(new Map<string, { full_name: string; role: CRMRole }>()),
  ]);

  const leadLookupMap = new Map<string, LeadLookupRow>(
    ((leadLookupRes.data ?? []) as LeadLookupRow[]).map((lead) => [lead.id, lead])
  );

  const nowMs = Date.now();

  const crmTasks: UnifiedTaskItem[] = taskRows.map((row) => {
    const linkedLead = row.lead_id ? leadLookupMap.get(row.lead_id) : null;
    const dueAt = row.due_at ?? row.updated_at ?? row.created_at;
    const pendingMinutes = Math.max(
      0,
      Math.round((nowMs - new Date(row.updated_at ?? row.created_at).getTime()) / 60000)
    );
    const task: UnifiedTaskItem = {
      id: row.id,
      source: "crm_task",
      title: row.title,
      description: row.description,
      priority: row.priority,
      status: row.status,
      due_at: dueAt,
      pending_minutes: pendingMinutes,
      urgency_score: 0,
      lead_id: row.lead_id,
      lead_name: linkedLead?.name ?? null,
      lead_phone: linkedLead?.phone ?? null,
      lead_trip_slug: linkedLead?.trip_slug ?? null,
      lead_status: linkedLead?.crm_status ?? null,
      assigned_to: row.assigned_to,
      assignee_name: row.assigned_to ? assignees.get(row.assigned_to)?.full_name ?? null : null,
      created_by: row.created_by,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    task.urgency_score = computeUrgencyScore(task);
    return task;
  });

  const followupTasks: UnifiedTaskItem[] = leadRows.map((row) => {
    const dueAt = row.next_follow_up_at ?? new Date().toISOString();
    const pendingMinutes = Math.max(0, Math.round((nowMs - new Date(row.updated_at ?? row.created_at ?? dueAt).getTime()) / 60000));
    const priority = getTaskPriority(row.crm_status as LeadStatus, row.next_follow_up_at) as TaskPriority;
    const task: UnifiedTaskItem = {
      id: `lead-${row.id}`,
      source: "lead_follow_up",
      title: row.name ? `Follow up: ${row.name}` : "Follow up lead",
      description: row.trip_slug ? `Trip: ${row.trip_slug.replace(/-/g, " ")}` : null,
      priority,
      status: "in_progress",
      due_at: dueAt,
      pending_minutes: pendingMinutes,
      urgency_score: 0,
      lead_id: row.id,
      lead_name: row.name,
      lead_phone: row.phone,
      lead_trip_slug: row.trip_slug,
      lead_status: row.crm_status,
      assigned_to: row.allotted_to,
      assignee_name: row.allotted_to ? assignees.get(row.allotted_to)?.full_name ?? null : null,
      created_by: null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    };
    task.urgency_score = computeUrgencyScore(task);
    return task;
  });

  return sortUnifiedTasks([...crmTasks, ...followupTasks]).slice(0, limit);
}

export async function completeDueTask(params: { leadId: string }) {
  const { supabase, profile } = await getCurrentProfile();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, allotted_to, crm_status, next_follow_up_at")
    .eq("id", params.leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }

  const manager = isManagerRole(profile.role);
  if (!manager && lead.allotted_to !== profile.id) {
    throw new Error("Only lead owner can complete this follow-up");
  }

  if (["won", "dropped", "archived"].includes(lead.crm_status as string)) {
    throw new Error("This lead is already in a terminal state");
  }

  const now = new Date();
  const nextFollowUpAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const { error } = await supabase
    .from("leads")
    .update({
      next_follow_up_at: nextFollowUpAt.toISOString(),
      last_follow_up_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", params.leadId);

  if (error) {
    throw new Error(error.message);
  }

  await logLeadActivity({
    leadId: params.leadId,
    actorId: profile.id,
    eventType: "follow_up_changed",
    message: "Follow-up completed from dashboard task queue",
    fieldName: "next_follow_up_at",
    beforeValue: lead.next_follow_up_at,
    afterValue: nextFollowUpAt.toISOString(),
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${params.leadId}`);

  return { success: true, next_follow_up_at: nextFollowUpAt.toISOString() };
}

export async function assignLeadToAgent(params: { leadId: string; agentId: string }) {
  const { supabase, profile } = await getCurrentProfile();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, allotted_to, crm_status")
    .eq("id", params.leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }

  const manager = isManagerRole(profile.role);

  if (!manager) {
    if (params.agentId !== profile.id) {
      throw new Error("Only managers can assign leads to other users");
    }
    if (lead.allotted_to && lead.allotted_to !== profile.id) {
      throw new Error("Lead is already owned by another agent");
    }
  }

  const nextStatus = (lead.crm_status || "new") === "new" ? "follow_up_1" : lead.crm_status;

  const { error } = await supabase
    .from("leads")
    .update({
      allotted_to: params.agentId,
      crm_status: nextStatus,
    })

    .eq("id", params.leadId);

  if (error) {
    if (error.code === "42501") {
      throw new Error("Claim blocked by permissions. Unassigned leads can only be claimed by yourself.");
    }
    throw new Error(error.message);
  }

  const ownerMap = await getProfileMapByIds([params.agentId, lead.allotted_to].filter(Boolean) as string[]);
  const nextOwner = ownerMap.get(params.agentId)?.full_name ?? "Assigned user";
  const previousOwner = lead.allotted_to ? ownerMap.get(lead.allotted_to)?.full_name ?? "Unknown owner" : "Unassigned";

  await logLeadActivity({
    leadId: params.leadId,
    actorId: profile.id,
    eventType: "reassigned",
    message: `Lead owner changed from ${previousOwner} to ${nextOwner}`,
    fieldName: "allotted_to",
    beforeValue: lead.allotted_to,
    afterValue: params.agentId,
    metadata: {
      previous_status: lead.crm_status,
      next_status: nextStatus,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/team");

  return { success: true };
}

async function getManagerForTeam(teamId: string | null) {
  if (!teamId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id")
    .eq("team_id", teamId)
    .in("role", ["sales_manager", "operations_manager", "admin"])
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  return data?.id || null;
}

export async function requestEscalation(params: { leadId: string; reason: string }) {
  const { supabase, profile } = await getCurrentProfile();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, allotted_to, team_id")
    .eq("id", params.leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }

  if (lead.allotted_to !== profile.id) {
    throw new Error("Only the lead owner can escalate");
  }

  const managerId = await getManagerForTeam(lead.team_id as string | null);

  const { error } = await supabase
    .from("leads")
    .update({
      escalated_to: managerId,
      escalation_reason: params.reason.trim(),
      escalated_at: new Date().toISOString(),
    })
    .eq("id", params.leadId);

  if (error) throw new Error(error.message);

  await supabase.from("lead_notes").insert({
    lead_id: params.leadId,
    agent_id: profile.id,
    note_type: "escalation_note",
    content: params.reason.trim(),
  });

  if (managerId) {
    await supabase.schema("crm").from("notifications").insert({
      user_id: managerId,
      title: "Lead escalated",
      body: `${profile.full_name} escalated a lead and requested review.`,
      type: "warning",
      link: `/dashboard/leads/${params.leadId}`,
      send_email: false,
    });
  }

  await logLeadActivity({
    leadId: params.leadId,
    actorId: profile.id,
    eventType: "escalated",
    message: "Lead escalated for manager review",
    fieldName: "escalated_at",
    beforeValue: null,
    afterValue: new Date().toISOString(),
    metadata: {
      escalated_to: managerId,
      reason: params.reason.trim(),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/logs");

  return { success: true, escalated_to: managerId };
}

export async function resolveEscalation(params: {
  leadId: string;
  note?: string;
  reassignToId?: string;
}) {
  const { supabase, profile } = await getCurrentProfile();
  if (!isManagerRole(profile.role)) {
    throw new Error("Only managers/admin can resolve escalations");
  }

  const updatePayload: Record<string, string | null> = {
    escalated_to: null,
    escalation_reason: null,
    escalated_at: null,
  };

  if (params.reassignToId) {
    updatePayload.allotted_to = params.reassignToId;
  }

  const { error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", params.leadId);

  if (error) throw new Error(error.message);

  if (params.note?.trim()) {
    await supabase.from("lead_notes").insert({
      lead_id: params.leadId,
      agent_id: profile.id,
      note_type: "general_note",
      content: params.note.trim(),
    });
  }

  await logLeadActivity({
    leadId: params.leadId,
    actorId: profile.id,
    eventType: "escalation_resolved",
    message: params.reassignToId
      ? "Escalation resolved and lead reassigned"
      : "Escalation resolved",
    fieldName: "escalated_at",
    beforeValue: "set",
    afterValue: null,
    metadata: {
      reassign_to_id: params.reassignToId ?? null,
      note: params.note ?? null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/logs");

  return { success: true };
}

interface CreateManualLeadInput {
  name: string;
  phone: string;
  email?: string | null;
  source?: string | null;
  trip_slug?: string | null;
  lead_type?: "domestic" | "international" | null;
  notes?: string | null;
  assignToId?: string | null;
  claimSelf?: boolean;
  reassignExistingToId?: string | null;
}

export async function createManualLead(input: CreateManualLeadInput) {
  const { supabase, profile } = await getCurrentProfile();

  const normalizedPhone = normalizePhone(input.phone);
  if (!normalizedPhone) {
    throw new Error("Valid phone number is required");
  }

  const { data: duplicateRows, error: duplicateError } = await supabase
    .from("leads")
    .select("id, name, allotted_to, crm_status")
    .eq("normalized_phone", normalizedPhone)
    .limit(1);

  if (duplicateError) {
    console.error("duplicate check failed", duplicateError);
    throw new Error("Could not validate duplicate phone number");
  }

  const duplicate = duplicateRows?.[0];
  if (duplicate) {
    const ownerId = duplicate.allotted_to as string | null;

    if (input.reassignExistingToId && isManagerRole(profile.role)) {
      await supabase
        .from("leads")
        .update({ allotted_to: input.reassignExistingToId })
        .eq("id", duplicate.id);
      revalidatePath("/dashboard/leads");
      return {
        success: true,
        duplicate: true,
        existing_lead_id: duplicate.id,
        reassigned: true,
      };
    }

    const profileMap = await getProfileMapByIds(ownerId ? [ownerId] : []);
    const owner = ownerId ? profileMap.get(ownerId) : null;

    return {
      success: false,
      duplicate: true,
      existing_lead_id: duplicate.id,
      owner_name: owner?.full_name || "Unassigned",
      owner_role: owner?.role || null,
      crm_status: duplicate.crm_status,
      message: "Lead with this phone number already exists",
    };
  }

  const placeholderEmail = `${normalizedPhone}.${Date.now()}@manual.tripwithnomads.local`;

  const assignToId = isManagerRole(profile.role)
    ? input.assignToId || (input.claimSelf ? profile.id : null)
    : profile.id;

  const initialStatus: LeadStatus = assignToId ? "claimed" : "new";
  const resolvedTripType = input.lead_type || inferTripType(input.trip_slug || input.source || null);

  const { data: insertedLead, error } = await supabase
    .from("leads")
    .insert({
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: (input.email || "").trim() || placeholderEmail,
      source: (input.source || "manual_entry").trim(),
      status: "submitted",
      trip_slug: (input.trip_slug || "").trim() || null,
      lead_type: resolvedTripType || null,
      trip_type: resolvedTripType || null,
      allotted_to: assignToId,
      crm_status: initialStatus,
      next_follow_up_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !insertedLead) {
    throw new Error(error?.message || "Unable to create manual lead");
  }

  if (input.notes?.trim()) {
    await supabase.from("lead_notes").insert({
      lead_id: insertedLead.id,
      agent_id: profile.id,
      note_type: "general_note",
      content: input.notes.trim(),
    });
  }

  await logLeadActivity({
    leadId: insertedLead.id,
    actorId: profile.id,
    eventType: "lead_created",
    message: "Lead added manually in CRM",
    metadata: {
      source: "manual_entry",
      assigned_to: assignToId,
      initial_status: initialStatus,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");

  return {
    success: true,
    duplicate: false,
    lead: insertedLead as Lead,
  };
}

interface UpdateLeadDetailsInput {
  leadId: string;
  updates: Partial<
    Pick<
      Lead,
      | "email"
      | "name"
      | "phone"
      | "source"
      | "trip_slug"
      | "page_url"
      | "utm_source"
      | "utm_medium"
      | "utm_campaign"
      | "lead_type"
      | "trip_type"
      | "drop_reason"
      | "next_follow_up_at"
      | "last_follow_up_at"
      | "crm_status"
      | "team_id"
    >
  >;
  note?: string;
}

export async function updateLeadDetails(input: UpdateLeadDetailsInput) {
  const { supabase, profile } = await getCurrentProfile();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", input.leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }

  const manager = isManagerRole(profile.role);
  if (!manager && lead.allotted_to !== profile.id) {
    throw new Error("Only lead owner can update this lead");
  }

  const payload = { ...input.updates } as Record<string, unknown>;

  const leadTypeValue =
    payload.lead_type === "domestic" || payload.lead_type === "international"
      ? (payload.lead_type as "domestic" | "international")
      : null;
  const tripTypeValue =
    payload.trip_type === "domestic" || payload.trip_type === "international"
      ? (payload.trip_type as "domestic" | "international")
      : null;

  if (leadTypeValue && !tripTypeValue) {
    payload.trip_type = leadTypeValue;
  }
  if (tripTypeValue && !leadTypeValue) {
    payload.lead_type = tripTypeValue;
  }

  if (!manager) {
    delete payload.name;
    delete payload.phone;
  }

  if (Object.keys(payload).length > 0) {
    const { error } = await supabase.from("leads").update(payload).eq("id", input.leadId);
    if (error) {
      throw new Error(error.message);
    }

    await Promise.all(
      Object.entries(payload).map(async ([fieldName, nextValue]) => {
        await logLeadActivity({
          leadId: input.leadId,
          actorId: profile.id,
          eventType: fieldName === "next_follow_up_at" ? "follow_up_changed" : "field_updated",
          message: `${fieldName.replace(/_/g, " ")} updated`,
          fieldName,
          beforeValue: lead[fieldName] != null ? String(lead[fieldName]) : null,
          afterValue: nextValue != null ? String(nextValue) : null,
        });
      })
    );
  }

  if (input.note?.trim()) {
    const { error: noteError } = await supabase.from("lead_notes").insert({
      lead_id: input.leadId,
      agent_id: profile.id,
      note_type: "general_note",
      content: input.note.trim(),
    });
    if (noteError) {
      throw new Error(noteError.message);
    }
  }

  return { success: true };
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const { supabase, profile } = await getCurrentProfile();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, allotted_to, crm_status, next_follow_up_at")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    throw new Error("Lead not found");
  }

  const manager = isManagerRole(profile.role);
  
  // Logic: 
  // 1. Managers can move anything.
  // 2. Agents can move leads they own.
  // 3. Agents can move 'new' leads to ANY status (auto-assigns)
  const isFromNew = lead.crm_status === "new";
  const isOwner = lead.allotted_to === profile.id;

  if (!manager && !isOwner && !isFromNew) {
    throw new Error("Only the owner or a manager can move this lead.");
  }

  const updatePayload: Record<string, unknown> = {
    crm_status: status,
    updated_at: new Date().toISOString(),
  };

  if (isFromNew && !lead.allotted_to) {
    updatePayload.allotted_to = profile.id;
  }

  if (status === "won") {
    updatePayload.won_at = new Date().toISOString();
  }
  if (status === "dropped") {
    updatePayload.dropped_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("leads")
    .update(updatePayload)
    .eq("id", leadId);

  if (error) {
    throw new Error(error.message);
  }

  await logLeadActivity({
    leadId,
    actorId: profile.id,
    eventType: "status_changed",
    message: `Lead moved from ${lead.crm_status} to ${status}`,
    fieldName: "crm_status",
    beforeValue: lead.crm_status,
    afterValue: status,
  });

  const needsFollowUpPrompt =
    !["won", "dropped", "archived", "handed_off"].includes(status) && !lead.next_follow_up_at;

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${leadId}`);

  return { success: true, follow_up_missing: needsFollowUpPrompt };
}

export async function checkDuplicatePhone(phone: string) {
  const { supabase } = await getCurrentProfile();
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const { data: duplicateRows } = await supabase
    .from("leads")
    .select("id, name, allotted_to, crm_status")
    .eq("normalized_phone", normalizedPhone)
    .limit(1);

  const duplicate = duplicateRows?.[0];
  if (!duplicate) return null;

  const ownerId = duplicate.allotted_to as string | null;
  const profileMap = await getProfileMapByIds(ownerId ? [ownerId] : []);
  const owner = ownerId ? profileMap.get(ownerId) : null;

  return {
    existing_lead_id: duplicate.id,
    owner_name: owner?.full_name || "Unassigned",
    owner_role: owner?.role || null,
    crm_status: duplicate.crm_status,
  };
}

export async function approveUser(params: {
  userId: string;
  role: CRMRole;
  status: "active" | "suspended";
  teamId?: string | null;
}) {
  const { supabase, profile } = await getCurrentProfile();
  if (!isManagerRole(profile.role)) {
    throw new Error("Only managers/admin can approve users");
  }

  const scope = await resolveManagerScope(supabase, profile);
  const { data: targetProfile, error: targetProfileError } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, team_id")
    .eq("id", params.userId)
    .single();

  if (targetProfileError || !targetProfile) {
    throw new Error("User not found");
  }

  if (!scope.canAccessAll && !canAccessTeam(scope, targetProfile.team_id as string | null)) {
    throw new Error("You can only approve users in your managed teams");
  }

  if (!scope.canAccessAll && params.teamId && !canAccessTeam(scope, params.teamId)) {
    throw new Error("You can only assign approved users to teams in your scope");
  }

  const { error } = await supabase
    .schema("crm")
    .from("profiles")
    .update({
      role: params.role,
      status: params.status,
      team_id: params.teamId || null,
    })
    .eq("id", params.userId);

  if (error) throw new Error(error.message);

  await supabase.schema("crm").from("notifications").insert({
    user_id: params.userId,
    title: params.status === "active" ? "Account approved" : "Account updated",
    body:
      params.status === "active"
        ? "Your CRM account has been approved."
        : "Your CRM access status has been updated.",
    type: params.status === "active" ? "success" : "warning",
    link: "/dashboard",
    send_email: false,
  });

  revalidatePath("/dashboard/approvals");
  return { success: true };
}

export async function approveWeeklyOff(params: {
  requestId: string;
  status: "approved" | "rejected";
  approvedDayOfWeek?: number | null;
}) {
  const { supabase, profile } = await getCurrentProfile();
  if (!isManagerRole(profile.role)) {
    throw new Error("Only managers/admin can approve weekly off");
  }

  const scope = await resolveManagerScope(supabase, profile);

  const { data: request, error: requestError } = await supabase
    .schema("crm")
    .from("weekly_off_requests")
    .select("id, user_id")
    .eq("id", params.requestId)
    .single();

  if (requestError || !request) {
    throw new Error("Weekly off request not found");
  }

  if (!scope.canAccessAll) {
    const { data: requestUser, error: requestUserError } = await supabase
      .schema("crm")
      .from("profiles")
      .select("id, team_id")
      .eq("id", request.user_id)
      .single();

    if (requestUserError || !requestUser) {
      throw new Error("Request user not found");
    }

    if (!canAccessTeam(scope, requestUser.team_id as string | null)) {
      throw new Error("You can only review weekly off requests in your managed teams");
    }
  }

  const { error } = await supabase
    .schema("crm")
    .from("weekly_off_requests")
    .update({
      status: params.status,
      approved_day_of_week:
        params.status === "approved"
          ? typeof params.approvedDayOfWeek === "number"
            ? params.approvedDayOfWeek
            : null
          : null,
      reviewer_id: profile.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.requestId);

  if (error) throw new Error(error.message);

  await supabase.schema("crm").from("notifications").insert({
    user_id: request.user_id,
    title: "Weekly off request reviewed",
    body:
      params.status === "approved"
        ? "Your weekly off request was approved."
        : "Your weekly off request was rejected.",
    type: params.status === "approved" ? "success" : "warning",
    link: "/dashboard/attendance",
    send_email: false,
  });

  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/attendance");
  return { success: true };
}

export async function listPendingApprovals(): Promise<{
  pendingUsers: PendingUserApproval[];
  pendingWeeklyOff: PendingWeeklyOffApproval[];
}> {
  const { supabase, profile } = await getCurrentProfile();
  if (!isManagerRole(profile.role)) {
    throw new Error("Only managers/admin can access approvals");
  }

  const [profilesResult, weeklyOffResult] = await Promise.all([
    supabase
      .schema("crm")
      .from("profiles")
      .select("id, full_name, email, role, status, created_at, team_id")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .schema("crm")
      .from("weekly_off_requests")
      .select("id, user_id, requested_week_start, requested_day_of_week, reason, status, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const pendingUsers = (profilesResult.data || []) as PendingUserApproval[];
  const weeklyRows = (weeklyOffResult.data || []) as PendingWeeklyOffRow[];

  const userIds = weeklyRows.map((row) => row.user_id);
  const userMap = await getProfileMapByIds(userIds);

  const weeklyOff: PendingWeeklyOffApproval[] = weeklyRows.map((row) => ({
    ...row,
    user_name: userMap.get(row.user_id)?.full_name || "Unknown",
    user_role: userMap.get(row.user_id)?.role || null,
  }));

  return {
    pendingUsers,
    pendingWeeklyOff: weeklyOff,
  };
}

export async function listAssignableAgents(): Promise<AssignableAgent[]> {
  const { supabase, profile } = await getCurrentProfile();
  if (!isManagerRole(profile.role)) {
    return [{ id: profile.id, full_name: profile.full_name, role: profile.role }];
  }

  const { data } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, full_name, role, status")
    .in("role", ["sales_agent", "sales_manager", "operations_manager"])
    .eq("status", "active")
    .order("full_name", { ascending: true });

  return (data || []) as AssignableAgent[];
}

export async function setMyDebugRole(nextRole: CRMRole) {
  const { supabase, profile, user } = await getCurrentProfile();
  const userEmail = (user.email || "").toLowerCase();
  const canDebugSwitch = profile.role === "admin" || DEBUG_ROLE_ALLOWED_EMAILS.has(userEmail);

  if (!canDebugSwitch) {
    throw new Error("You are not allowed to switch debug roles");
  }

  const rpcResult = await supabase.schema("crm").rpc("set_my_debug_role", { next_role: nextRole });

  if (rpcResult.error && !isMissingFunction(rpcResult.error as SupabaseQueryError)) {
    throw new Error(rpcResult.error.message);
  }

  if (rpcResult.error && isMissingFunction(rpcResult.error as SupabaseQueryError)) {
    const { error } = await supabase
      .schema("crm")
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", profile.id);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard/settings");

  return {
    success: true,
    role: nextRole,
  };
}
