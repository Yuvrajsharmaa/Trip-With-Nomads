import { redirect } from "next/navigation";

import { getRequestContext } from "@/lib/auth/request-context";
import { canAccessTeam, resolveManagerScope } from "@/lib/auth/manager-scope";
import { listPendingApprovals } from "@/lib/actions/crm-core";
import { getAttendanceTimeline, getTimeOffRequests, getWeeklyOffRequests } from "@/lib/actions/attendance";
import type { TeamRangeComparison } from "@/types/dashboard";
import type { TeamInvitation } from "@/types/team-invitations";
import {
  TeamHub,
  type TeamHubActivityItem,
  type TeamHubGoal,
  type TeamHubMember,
  type TeamHubTeam,
  type TeamHubWeeklyOffHistoryItem,
} from "@/components/dashboard/team-hub";
import { isManagerRole } from "@/types/roles";

export const dynamic = "force-dynamic";

interface TeamPageProps {
  searchParams: Promise<{
    tab?: string;
    range?: string;
    from?: string;
    to?: string;
    agent?: string;
  }>;
}

const TERMINAL_STATUSES = new Set(["won", "dropped", "archived"]);

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function resolveRange(range: string, customFrom?: string, customTo?: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const from = new Date(today);
  const to = new Date(today);

  switch (range) {
    case "yesterday":
      return { from: toIsoDate(yesterday), to: toIsoDate(yesterday) };
    case "1w":
      from.setDate(today.getDate() - 6);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    case "1m":
      from.setMonth(today.getMonth() - 1);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    case "3m":
      from.setMonth(today.getMonth() - 3);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    case "6m":
      from.setMonth(today.getMonth() - 6);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    case "1y":
      from.setFullYear(today.getFullYear() - 1);
      return { from: toIsoDate(from), to: toIsoDate(to) };
    case "custom":
      return {
        from: customFrom || toIsoDate(today),
        to: customTo || toIsoDate(today),
      };
    case "today":
    default:
      return { from: toIsoDate(today), to: toIsoDate(today) };
  }
}

function isInRange(value: string | null | undefined, fromIso: string, toIso: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  const start = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const end = new Date(`${toIso}T23:59:59.999Z`).getTime();
  return time >= start && time <= end;
}

function isSchemaMismatchMessage(message: string | null | undefined) {
  const text = String(message || "").toLowerCase();
  return text.includes("does not exist") || text.includes("could not find");
}

function previousRangeFrom(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso}T00:00:00.000Z`);
  const to = new Date(`${toIso}T00:00:00.000Z`);
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);

  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);

  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (spanDays - 1));

  return {
    from: toIsoDate(prevFrom),
    to: toIsoDate(prevTo),
  };
}

function buildDelta(current: number, previous: number) {
  const absoluteChange = current - previous;
  const percentChange = previous === 0 ? null : Number(((absoluteChange / previous) * 100).toFixed(1));
  return {
    current: Number(current.toFixed(2)),
    previous: Number(previous.toFixed(2)),
    absolute_change: Number(absoluteChange.toFixed(2)),
    percent_change: percentChange,
  };
}

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const { user, profile, supabase } = await getRequestContext();
  if (!user) redirect("/login");
  if (!profile || profile.status !== "active") redirect("/dashboard");
  if (!isManagerRole(profile.role)) redirect("/dashboard");
  const scope = await resolveManagerScope(supabase, profile);

  const params = await searchParams;
  const tabParam = params.tab || "members";
  const initialTab = ["members", "invites", "activity", "approvals"].includes(tabParam)
    ? (tabParam as "members" | "invites" | "activity" | "approvals")
    : "members";
  const range = params.range || "1w";
  const selectedAgentId = params.agent || null;
  const { from, to } = resolveRange(range, params.from, params.to);
  const previousRange = previousRangeFrom(from, to);

  const [
    profilesResult,
    teamsResult,
    leadsResult,
    tasksResult,
    activityResult,
    goalsResult,
    pendingApprovals,
    attendanceTimeline,
    timeOffRequests,
    weeklyOffRequests,
    invitesResult,
    previousWon,
    previousDropped,
    previousTasksDone,
    previousAttendance,
  ] = await Promise.all([
    scope.canAccessAll
      ? supabase
          .schema("crm")
          .from("profiles")
          .select("id, full_name, email, role, status, team_id, created_at")
          .in("role", ["admin", "operations_manager", "sales_manager", "sales_agent", "finance_manager", "finance_agent"])
          .order("created_at", { ascending: false })
      : scope.teamIds.length > 0
        ? supabase
            .schema("crm")
            .from("profiles")
            .select("id, full_name, email, role, status, team_id, created_at")
            .in("role", ["admin", "operations_manager", "sales_manager", "sales_agent", "finance_manager", "finance_agent"])
            .in("team_id", scope.teamIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    scope.canAccessAll
      ? supabase
          .schema("crm")
          .from("teams")
          .select("id, name, manager_id")
          .order("name", { ascending: true })
      : scope.teamIds.length > 0
        ? supabase
            .schema("crm")
            .from("teams")
            .select("id, name, manager_id")
            .in("id", scope.teamIds)
            .order("name", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    supabase
      .from("leads")
      .select("id, name, allotted_to, crm_status, won_at, dropped_at, escalated_at, next_follow_up_at")
      .not("allotted_to", "is", null),
    supabase
      .schema("crm")
      .from("tasks")
      .select("id, assigned_to, status, updated_at")
      .not("assigned_to", "is", null),
    supabase
      .schema("crm")
      .from("lead_activity")
      .select("id, lead_id, actor_id, event_type, message, created_at")
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lte("created_at", `${to}T23:59:59.999Z`)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .schema("crm")
      .from("team_goals")
      .select("id, owner_scope, owner_id, team_id, metric_key, period, starts_on, ends_on, target_value, is_active, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    listPendingApprovals().catch(() => ({ pendingUsers: [], pendingWeeklyOff: [] })),
    getAttendanceTimeline({ dateFrom: from, dateTo: to, agentId: selectedAgentId || undefined }).catch(() => []),
    getTimeOffRequests().catch(() => []),
    getWeeklyOffRequests().catch(() => []),
    supabase
      .schema("crm")
      .from("team_invitations")
      .select("id, email, role, team_id, invited_by, token_hash, status, expires_at, sent_at, accepted_by, accepted_at, revoked_at, metadata, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(100),
    (() => {
      let query = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("crm_status", "won")
        .gte("won_at", `${previousRange.from}T00:00:00.000Z`)
        .lte("won_at", `${previousRange.to}T23:59:59.999Z`);
      if (selectedAgentId) query = query.eq("allotted_to", selectedAgentId);
      return query;
    })(),
    (() => {
      let query = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("crm_status", "dropped")
        .gte("dropped_at", `${previousRange.from}T00:00:00.000Z`)
        .lte("dropped_at", `${previousRange.to}T23:59:59.999Z`);
      if (selectedAgentId) query = query.eq("allotted_to", selectedAgentId);
      return query;
    })(),
    (() => {
      let query = supabase
        .schema("crm")
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("status", "done")
        .gte("updated_at", `${previousRange.from}T00:00:00.000Z`)
        .lte("updated_at", `${previousRange.to}T23:59:59.999Z`);
      if (selectedAgentId) query = query.eq("assigned_to", selectedAgentId);
      return query;
    })(),
    (() => {
      let query = supabase
        .from("attendance_logs")
        .select("total_hours, agent_id")
        .gte("work_date", previousRange.from)
        .lte("work_date", previousRange.to);
      if (selectedAgentId) query = query.eq("agent_id", selectedAgentId);
      return query;
    })(),
  ]);

  const profiles = (profilesResult.data || []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    status: string;
    team_id: string | null;
    created_at: string;
  }>;
  const teams = (teamsResult.data || []) as Array<{ id: string; name: string; manager_id: string | null }>;
  const allLeads = (leadsResult.data || []) as Array<{
    id: string;
    name: string | null;
    allotted_to: string | null;
    crm_status: string;
    won_at: string | null;
    dropped_at: string | null;
    escalated_at: string | null;
    next_follow_up_at: string | null;
  }>;
  const allTasks = (tasksResult.data || []) as Array<{
    id: string;
    assigned_to: string | null;
    status: string;
    updated_at: string | null;
  }>;

  const allActivityRows = (activityResult.data || []) as Array<{
    id: string;
    lead_id: string;
    actor_id: string | null;
    event_type: string;
    message: string;
    created_at: string;
  }>;

  const goals = goalsResult.error && isSchemaMismatchMessage(goalsResult.error.message)
    ? []
    : ((goalsResult.data || []) as TeamHubGoal[]);
  const allInvitations = invitesResult.error && isSchemaMismatchMessage(invitesResult.error.message)
    ? []
    : ((invitesResult.data || []) as TeamInvitation[]);

  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const teamMap = new Map(teams.map((item) => [item.id, item]));
  const scopedMemberIds = new Set(profiles.map((item) => item.id));

  const leads = allLeads.filter((lead) => lead.allotted_to && scopedMemberIds.has(lead.allotted_to));
  const tasks = allTasks.filter((task) => task.assigned_to && scopedMemberIds.has(task.assigned_to));
  const activityRows = allActivityRows.filter((row) => row.actor_id && scopedMemberIds.has(row.actor_id));
  const leadNameMap = new Map(leads.map((item) => [item.id, item.name || null]));
  const invitations = allInvitations.filter((item) => canAccessTeam(scope, item.team_id || null));
  const pendingUsersScoped = (pendingApprovals.pendingUsers || []).filter((user) => scopedMemberIds.has(user.id));
  const pendingWeeklyScoped = (pendingApprovals.pendingWeeklyOff || []).filter((request) => scopedMemberIds.has(request.user_id));
  const timeOffScoped = timeOffRequests.filter((request) => scopedMemberIds.has(request.agent_id));
  const weeklyOffScoped = weeklyOffRequests.filter((request) => scopedMemberIds.has(request.user_id));

  const rangeEndMs = new Date(`${to}T23:59:59.999Z`).getTime();
  const membersRaw: TeamHubMember[] = profiles
    .filter((item) => item.role.endsWith("_agent") || item.role.endsWith("_manager") || item.role === "admin")
    .map((member) => {
      const assignedLeads = leads.filter((lead) => lead.allotted_to === member.id);
      const activeLeads = assignedLeads.filter((lead) => !TERMINAL_STATUSES.has(lead.crm_status)).length;
      const overdueFollowups = assignedLeads.filter((lead) => {
        if (TERMINAL_STATUSES.has(lead.crm_status) || !lead.next_follow_up_at) return false;
        return new Date(lead.next_follow_up_at).getTime() < rangeEndMs;
      }).length;
      const escalatedOpen = assignedLeads.filter((lead) => Boolean(lead.escalated_at) && !TERMINAL_STATUSES.has(lead.crm_status)).length;
      const wonInRange = assignedLeads.filter((lead) => isInRange(lead.won_at, from, to)).length;
      const droppedInRange = assignedLeads.filter((lead) => isInRange(lead.dropped_at, from, to)).length;

      const memberTasks = tasks.filter((task) => task.assigned_to === member.id);
      const tasksDoneInRange = memberTasks.filter(
        (task) => task.status === "done" && isInRange(task.updated_at, from, to)
      ).length;

      const memberAttendance = attendanceTimeline.filter((entry) => entry.agent_id === member.id);
      const attendanceHours = memberAttendance.reduce((sum, entry) => sum + Number(entry.total_hours || 0), 0);
      const attendanceDays = memberAttendance.length;

      const pendingTimeOff = timeOffScoped.filter(
        (request) => request.agent_id === member.id && request.status === "pending"
      ).length;
      const pendingWeeklyOff = weeklyOffScoped.filter(
        (request) => request.user_id === member.id && request.status === "pending"
      ).length;

      return {
        id: member.id,
        full_name: member.full_name || "Unnamed",
        email: member.email,
        role: member.role,
        status: member.status,
        team_id: member.team_id,
        team_name: member.team_id ? teamMap.get(member.team_id)?.name || null : null,
        active_leads: activeLeads,
        overdue_followups: overdueFollowups,
        escalated_open: escalatedOpen,
        won_in_range: wonInRange,
        dropped_in_range: droppedInRange,
        tasks_done_in_range: tasksDoneInRange,
        attendance_hours_in_range: Number(attendanceHours.toFixed(2)),
        attendance_days_in_range: attendanceDays,
        pending_time_off: pendingTimeOff,
        pending_weekly_off: pendingWeeklyOff,
      };
    });

  const members = selectedAgentId
    ? membersRaw.filter((member) => member.id === selectedAgentId)
    : membersRaw;

  const currentWon = members.reduce((sum, member) => sum + member.won_in_range, 0);
  const currentDropped = members.reduce((sum, member) => sum + member.dropped_in_range, 0);
  const currentTasksDone = members.reduce((sum, member) => sum + member.tasks_done_in_range, 0);
  const currentAttendanceHours = members.reduce((sum, member) => sum + member.attendance_hours_in_range, 0);

  const previousAttendanceHours = ((previousAttendance.data || []) as Array<{ total_hours: number | null }>)
    .reduce((sum, row) => sum + Number(row.total_hours || 0), 0);

  const comparison: TeamRangeComparison = {
    won: buildDelta(currentWon, previousWon.count || 0),
    dropped: buildDelta(currentDropped, previousDropped.count || 0),
    tasks_done: buildDelta(currentTasksDone, previousTasksDone.count || 0),
    attendance_hours: buildDelta(currentAttendanceHours, previousAttendanceHours),
  };

  const teamsWithCounts: TeamHubTeam[] = teams.map((team) => ({
    id: team.id,
    name: team.name,
    manager_id: team.manager_id,
    manager_name: team.manager_id ? profileMap.get(team.manager_id)?.full_name || null : null,
    members_count: membersRaw.filter((member) => member.team_id === team.id).length,
  }));

  const activity: TeamHubActivityItem[] = activityRows
    .filter((item) => !selectedAgentId || item.actor_id === selectedAgentId)
    .map((item) => ({
      id: item.id,
      lead_id: item.lead_id,
      lead_name: leadNameMap.get(item.lead_id) || null,
      actor_name: item.actor_id ? profileMap.get(item.actor_id)?.full_name || "Unknown" : "System",
      event_type: item.event_type,
      message: item.message,
      created_at: item.created_at,
    }));

  const weeklyOffHistory: TeamHubWeeklyOffHistoryItem[] = weeklyOffScoped
    .filter((entry) => entry.status !== "pending")
    .map((entry) => ({
      ...entry,
      user_name: profileMap.get(entry.user_id)?.full_name || "Agent",
    }));

  return (
    <TeamHub
      initialTab={initialTab}
      range={range}
      dateFrom={from}
      dateTo={to}
      selectedAgentId={selectedAgentId}
      teams={teamsWithCounts}
      members={members}
      activity={activity}
      pendingUsers={pendingUsersScoped}
      pendingWeeklyOff={pendingWeeklyScoped}
      weeklyOffHistory={weeklyOffHistory}
      timeOffRequests={timeOffScoped}
      goals={goals}
      invitations={invitations}
      comparison={comparison}
    />
  );
}
