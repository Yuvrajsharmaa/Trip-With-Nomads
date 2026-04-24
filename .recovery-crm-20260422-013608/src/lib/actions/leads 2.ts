"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { assignLeadToAgent, updateLeadStatus as updateLeadStatusCore } from "@/lib/actions/crm-core";
import type { Lead, LeadFilter } from "@/types/leads";
import { LEAD_STATUSES } from "@/types/leads";
import { logLeadActivity } from "@/lib/actions/lead-activity";
import { requireRequestContext } from "@/lib/auth/request-context";
import { isManagerRole } from "@/types/roles";

interface FetchLeadsParams {
  filter: LeadFilter;
  userId: string;
  search?: string;
  source?: string;
  leadType?: string;
  followup?: string;
  owner?: string;
  team?: string;
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  pageSize?: number;
}

interface FetchLeadsResult {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

interface SupabaseQueryError {
  code?: string;
  message?: string;
}

function calculateLeadCompleteness(lead: Lead) {
  const fields = [lead.name, lead.phone, lead.trip_slug, lead.source, lead.next_follow_up_at];
  const filled = fields.filter((value) => Boolean(value && String(value).trim().length > 0)).length;
  return Math.round((filled / fields.length) * 100);
}

function isSchemaMismatch(error: SupabaseQueryError | null | undefined) {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST205" || /does not exist/i.test(error.message || "");
}

function coerceLeadRow(row: Record<string, unknown>): Lead {
  const rawStatus = String((row.crm_status as string | null) || "").trim();
  const crmStatus = LEAD_STATUSES.includes(rawStatus as Lead["crm_status"])
    ? (rawStatus as Lead["crm_status"])
    : "new";

  return {
    id: String(row.id || ""),
    email: String(row.email || ""),
    name: (row.name as string | null) || null,
    phone: (row.phone as string | null) || null,
    normalized_phone: (row.normalized_phone as string | null) || null,
    source: (row.source as string | null) || null,
    status: (row.status as string | null) || null,
    page_url: (row.page_url as string | null) || null,
    trip_id: (row.trip_id as string | null) || null,
    trip_slug: (row.trip_slug as string | null) || null,
    utm_source: (row.utm_source as string | null) || null,
    utm_medium: (row.utm_medium as string | null) || null,
    utm_campaign: (row.utm_campaign as string | null) || null,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || row.created_at || new Date().toISOString()),
    crm_status: crmStatus,
    allotted_to: (row.allotted_to as string | null) || null,
    team_id: (row.team_id as string | null) || null,
    lead_type: (row.lead_type as string | null) || null,
    trip_type: (row.trip_type === "domestic" || row.trip_type === "international"
      ? (row.trip_type as "domestic" | "international")
      : null),
    last_follow_up_at: (row.last_follow_up_at as string | null) || null,
    next_follow_up_at: (row.next_follow_up_at as string | null) || null,
    follow_up_count: Number(row.follow_up_count || 0),
    drop_reason: (row.drop_reason as string | null) || null,
    dropped_at: (row.dropped_at as string | null) || null,
    won_at: (row.won_at as string | null) || null,
    escalated_to: (row.escalated_to as string | null) || null,
    escalation_reason: (row.escalation_reason as string | null) || null,
    escalated_at: (row.escalated_at as string | null) || null,
  };
}

async function fetchLegacyLeads(
  search: string | undefined,
  page: number,
  pageSize: number
): Promise<FetchLeadsResult> {
  const supabase = await createClient();
  let legacyQuery = supabase
    .from("leads")
    .select(
      "id,email,name,phone,source,status,page_url,trip_id,trip_slug,utm_source,utm_medium,utm_campaign,created_at,updated_at",
      { count: "exact" }
    );

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    legacyQuery = legacyQuery.or(
      `name.ilike.${term},phone.ilike.${term},email.ilike.${term},trip_slug.ilike.${term},source.ilike.${term}`
    );
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await legacyQuery
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("Error fetching leads (legacy fallback):", error);
    return { leads: [], total: 0, page, pageSize };
  }

  const leads = ((data || []) as Record<string, unknown>[]).map((row) => {
    const lead = coerceLeadRow(row);
    return {
      ...lead,
      completeness_score: calculateLeadCompleteness(lead),
      owner_name: null,
      owner_role: null,
    };
  });

  return {
    leads,
    total: count || 0,
    page,
    pageSize,
  };
}

async function getOwnerMap(ownerIds: string[]) {
  if (ownerIds.length === 0) return new Map<string, { full_name: string; role: string }>();

  const supabase = await createClient();
  const { data } = await supabase
    .schema("crm")
    .from("profiles")
    .select("id, full_name, role")
    .in("id", ownerIds);

  const ownerMap = new Map<string, { full_name: string; role: string }>();
  for (const row of data || []) {
    ownerMap.set(row.id as string, {
      full_name: (row.full_name as string) || "Unassigned",
      role: (row.role as string) || "sales_agent",
    });
  }

  return ownerMap;
}

function buildUuidInFilter(ids: string[]) {
  return `(${ids.map((id) => id.replaceAll('"', "")).join(",")})`;
}

function toSupabaseErrorDetails(error: unknown) {
  const raw = (error ?? {}) as Record<string, unknown>;
  return {
    code: raw.code ?? null,
    message: raw.message ?? null,
    details: raw.details ?? null,
    hint: raw.hint ?? null,
  };
}

function extractTripSlugFromUrl(value: string | null | undefined) {
  const url = String(value || "").trim();
  if (!url) return null;
  const normalized = url.toLowerCase();

  const upcomingMarker = "/upcoming-trips/";
  const tripsMarker = "/trips/";

  if (normalized.includes(upcomingMarker)) {
    const token = normalized.split(upcomingMarker)[1]?.split("?")[0]?.split("#")[0] || "";
    const cleaned = token.replace(/\/+$/g, "").trim();
    return cleaned || null;
  }

  if (normalized.includes(tripsMarker)) {
    const token = normalized.split(tripsMarker)[1]?.split("?")[0]?.split("#")[0] || "";
    const cleaned = token.replace(/\/+$/g, "").trim();
    return cleaned || null;
  }

  return null;
}

function inferTripType(value: string | null | undefined) {
  const content = String(value || "").toLowerCase();
  if (!content) return null;
  if (
    content.includes("international") ||
    content.includes("europe") ||
    content.includes("bali") ||
    content.includes("vietnam") ||
    content.includes("thailand")
  ) {
    return "international" as const;
  }
  return "domestic" as const;
}

async function getPendingDuplicateLeadIds(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .schema("crm")
    .from("lead_duplicates")
    .select("primary_lead_id, duplicate_lead_id")
    .eq("status", "pending");

  if (error) {
    return [];
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.primary_lead_id) ids.add(String(row.primary_lead_id));
    if (row.duplicate_lead_id) ids.add(String(row.duplicate_lead_id));
  }
  return Array.from(ids);
}

export async function fetchLeads({
  filter,
  userId,
  search,
  source,
  leadType,
  followup,
  owner,
  team,
  status,
  createdFrom,
  createdTo,
  page = 1,
  pageSize = 25,
}: FetchLeadsParams): Promise<FetchLeadsResult> {
  const supabase = await createClient();
  const pendingDuplicateLeadIds = await getPendingDuplicateLeadIds(supabase);
  const duplicateExclusionFilter = buildUuidInFilter(pendingDuplicateLeadIds);

  let query = supabase.from("leads").select("*", { count: "exact" });

  switch (filter) {
    case "unassigned":
      query = query.is("allotted_to", null).not("crm_status", "in", '("won","dropped","archived")');
      break;
    case "my_leads":
      query = query.eq("allotted_to", userId).not("crm_status", "in", '("won","dropped","archived")');
      break;
    case "won_dropped":
      query = query.in("crm_status", ["won", "dropped"]);
      break;
    case "archived":
      query = query.eq("crm_status", "archived");
      break;
    case "duplicates":
      break;
    case "all":
    default:
      // Exclude archived from the main "All Leads" view
      query = query.not("crm_status", "in", '("archived")');
      break;
  }

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `name.ilike.${term},phone.ilike.${term},email.ilike.${term},trip_slug.ilike.${term},source.ilike.${term}`
    );
  }

  if (source && source !== "all") {
    query = query.eq("source", source);
  }

  if (leadType && leadType !== "all") {
    query = query.eq("trip_type", leadType);
  }

  if (followup && followup !== "all") {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    if (followup === "due_today") {
      query = query
        .gte("next_follow_up_at", startOfDay.toISOString())
        .lte("next_follow_up_at", endOfDay.toISOString());
    } else if (followup === "overdue") {
      query = query
        .lt("next_follow_up_at", startOfDay.toISOString())
        .not("crm_status", "in", '("won","dropped","archived")');
    } else if (followup === "unscheduled") {
      query = query
        .is("next_follow_up_at", null)
        .not("crm_status", "in", '("won","dropped","archived")');
    }
  }

  if (owner && owner !== "all") {
    query = query.eq("allotted_to", owner);
  }

  if (team && team !== "all") {
    query = query.eq("team_id", team);
  }

  if (status && status !== "all") {
    query = query.eq("crm_status", status);
  }

  if (createdFrom) {
    const fromIso = createdFrom.includes("T") ? createdFrom : `${createdFrom}T00:00:00.000Z`;
    query = query.gte("created_at", fromIso);
  }

  if (createdTo) {
    const toIso = createdTo.includes("T") ? createdTo : `${createdTo}T23:59:59.999Z`;
    query = query.lte("created_at", toIso);
  }

  if (filter !== "duplicates" && pendingDuplicateLeadIds.length > 0) {
    query = query.not("id", "in", duplicateExclusionFilter);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query
    .order("next_follow_up_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    if (isSchemaMismatch(error as SupabaseQueryError)) {
      return fetchLegacyLeads(search, page, pageSize);
    }
    console.error("Error fetching leads:", toSupabaseErrorDetails(error));
    return { leads: [], total: 0, page, pageSize };
  }

  const leads = ((data || []) as Record<string, unknown>[]).map((row) => {
    const lead = coerceLeadRow(row);
    return {
      ...lead,
      completeness_score: calculateLeadCompleteness(lead),
    };
  });

  const ownerIds = Array.from(
    new Set(leads.map((lead) => lead.allotted_to).filter(Boolean) as string[])
  );
  const ownerMap = await getOwnerMap(ownerIds);

  const hydratedLeads = leads.map((lead) => {
    const owner = lead.allotted_to ? ownerMap.get(lead.allotted_to) : null;
    return {
      ...lead,
      owner_name: owner?.full_name || null,
      owner_role: owner?.role || null,
    };
  });

  return {
    leads: hydratedLeads,
    total: count || 0,
    page,
    pageSize,
  };
}

export async function getLeadById(leadId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).single();

  if (error || !data) {
    throw new Error("Lead not found");
  }

  const lead = coerceLeadRow((data || {}) as Record<string, unknown>);
  if (lead.allotted_to) {
    const owners = await getOwnerMap([lead.allotted_to]);
    const owner = owners.get(lead.allotted_to);
    return {
      ...lead,
      owner_name: owner?.full_name || null,
      owner_role: owner?.role || null,
      completeness_score: calculateLeadCompleteness(lead),
    };
  }

  return {
    ...lead,
    owner_name: null,
    owner_role: null,
    completeness_score: calculateLeadCompleteness(lead),
  };
}

export async function getLeadCounts(userId: string) {
  const supabase = await createClient();
  const pendingDuplicateLeadIds = await getPendingDuplicateLeadIds(supabase);
  const duplicateExclusionFilter = buildUuidInFilter(pendingDuplicateLeadIds);

  let allQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .not("crm_status", "in", '("archived")');
  let unassignedQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("allotted_to", null)
    .not("crm_status", "in", '("won","dropped","archived")');
  let myQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("allotted_to", userId)
    .not("crm_status", "in", '("won","dropped","archived")');
  let wonDroppedQuery = supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("crm_status", ["won", "dropped"]);

  if (pendingDuplicateLeadIds.length > 0) {
    allQuery = allQuery.not("id", "in", duplicateExclusionFilter);
    unassignedQuery = unassignedQuery.not("id", "in", duplicateExclusionFilter);
    myQuery = myQuery.not("id", "in", duplicateExclusionFilter);
    wonDroppedQuery = wonDroppedQuery.not("id", "in", duplicateExclusionFilter);
  }

  const [allResult, unassignedResult, myResult, wonDroppedResult, duplicatesPendingResult] = await Promise.all([
    allQuery,
    unassignedQuery,
    myQuery,
    wonDroppedQuery,
    supabase
      .schema("crm")
      .from("lead_duplicates")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  if (
    isSchemaMismatch(allResult.error as SupabaseQueryError) ||
    isSchemaMismatch(unassignedResult.error as SupabaseQueryError) ||
    isSchemaMismatch(myResult.error as SupabaseQueryError) ||
    isSchemaMismatch(wonDroppedResult.error as SupabaseQueryError)
  ) {
    const { count } = await supabase.from("leads").select("id", { count: "exact", head: true });
    return {
      all: count || 0,
      unassigned: count || 0,
      my_leads: 0,
      won_dropped: 0,
      duplicates: 0,
    };
  }

  return {
    all: allResult.count || 0,
    unassigned: unassignedResult.count || 0,
    my_leads: myResult.count || 0,
    won_dropped: wonDroppedResult.count || 0,
    duplicates: duplicatesPendingResult.count || 0,
  };
}

export async function getDashboardAnalytics(userId: string, isManager: boolean) {
  const supabase = await createClient();

  // Get the start of today for metrics
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayISO = startOfToday.toISOString();

  // Active status filter (not won, dropped, archived)
  const nonTerminalFilter = '("won","dropped","archived")';

  const [
    todayResult,
    unassignedResult,
    activeAssignedResult,
    overdueResult,
    sourcesResult
  ] = await Promise.all([
    // 1. Leads created today
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", startOfTodayISO),

    // 2. Unassigned Leads (Open)
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("allotted_to", null)
      .not("crm_status", "in", nonTerminalFilter),

    // 3. Active Assigned (Manager sees all active allotted; agent sees theirs)
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("allotted_to", "is", null)
      .not("crm_status", "in", nonTerminalFilter)
      .eq(isManager ? "" : "allotted_to", isManager ? "" : userId)
      .neq(isManager ? "id" : "", isManager ? "DO_NOT_FILTER" : ""),

    // 4. Overdue (Manager sees globally, Agent sees theirs)
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("crm_status", "in", nonTerminalFilter)
      .lt("next_follow_up_at", startOfTodayISO)
      .eq(isManager ? "" : "allotted_to", isManager ? "" : userId)
      .neq(isManager ? "id" : "", isManager ? "DO_NOT_FILTER" : ""),
      
    // 5. Source Distribution for Chart (Last 1000 leads for perf or just generic pull)
    // Supabase JS doesn't have native GROUP BY via select, so we use RPC or just fetch a subset.
    // Instead of RPC (since we aren't sure it exists), we grab the source column of recently created leads.
    supabase
      .from("leads")
      .select("source")
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  // Handle source grouping manually in edge
  const sourceGroups: Record<string, number> = {};
  if (sourcesResult.data) {
    sourcesResult.data.forEach((row) => {
      const src = (row.source as string || "Website").trim();
      sourceGroups[src] = (sourceGroups[src] || 0) + 1;
    });
  }

  const chartData = Object.entries(sourceGroups)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // top 5 sources

  // If "chartData" is empty, mock some data for the empty state
  if (chartData.length === 0) {
    chartData.push({ source: "Website", count: 12 });
    chartData.push({ source: "Instagram", count: 8 });
    chartData.push({ source: "Manual", count: 4 });
  }

  return {
    leadsToday: todayResult.count || 0,
    unassigned: unassignedResult.count || 0,
    activeAssigned: activeAssignedResult.count || 0,
    overdue: overdueResult.count || 0,
    sourceDistribution: chartData,
  };
}

export async function assignLead(leadId: string, agentId: string) {
  return assignLeadToAgent({ leadId, agentId });
}

export async function updateLeadStatus(leadId: string, status: LeadFilter | string) {
  return updateLeadStatusCore(leadId, status as Lead["crm_status"]);
}
export async function updateLeadFollowUp(leadId: string, scheduledAt: string | null) {
  const { supabase, user } = await requireRequestContext();

  const { data: previous } = await supabase
    .from("leads")
    .select("next_follow_up_at")
    .eq("id", leadId)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update({ 
      next_follow_up_at: scheduledAt,
      last_follow_up_at: new Date().toISOString()
    })
    .eq("id", leadId);

  if (error) {
    console.error("Error updating follow-up:", error);
    throw new Error("Failed to schedule follow-up");
  }

  await logLeadActivity({
    leadId,
    actorId: user.id,
    eventType: "follow_up_changed",
    message: scheduledAt ? "Follow-up scheduled/updated" : "Follow-up removed",
    fieldName: "next_follow_up_at",
    beforeValue: previous?.next_follow_up_at ?? null,
    afterValue: scheduledAt,
  });

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard/leads");
  return true;
}

export async function updateLeadContact(
  leadId: string,
  field: "name" | "email" | "phone",
  value: string
) {
  const { supabase, user } = await requireRequestContext();

  // Validate based on field type
  const trimmed = value.trim();

  if (field === "email" && trimmed) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      throw new Error("Please enter a valid email address");
    }
  }

  if (field === "phone" && trimmed) {
    // Allow digits, spaces, dashes, parens, plus sign — min 7 chars
    const phoneRegex = /^[+\d\s\-()]{7,20}$/;
    if (!phoneRegex.test(trimmed)) {
      throw new Error("Please enter a valid phone number (7-20 digits)");
    }
  }

  if (field === "name" && trimmed.length > 100) {
    throw new Error("Name must be under 100 characters");
  }

  const { data: previousLead } = await supabase
    .from("leads")
    .select(field)
    .eq("id", leadId)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update({ [field]: trimmed || null })
    .eq("id", leadId);

  if (error) {
    console.error(`Error updating lead ${field}:`, error);
    throw new Error(`Failed to update ${field}`);
  }

  await logLeadActivity({
    leadId,
    actorId: user.id,
    eventType: "field_updated",
    message: `${field} updated`,
    fieldName: field,
    beforeValue:
      previousLead && (previousLead as Record<string, unknown>)[field] != null
        ? String((previousLead as Record<string, unknown>)[field])
        : null,
    afterValue: trimmed || null,
  });

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard/leads");
  return true;
}

export async function updateLeadDetails(
  leadId: string,
  updates: Partial<Pick<Lead, "trip_slug" | "lead_type" | "trip_type">>
) {
  const { supabase, user } = await requireRequestContext();
  const normalizedUpdates: Partial<Pick<Lead, "trip_slug" | "lead_type" | "trip_type">> = { ...updates };

  const leadTypeValue =
    normalizedUpdates.lead_type === "domestic" || normalizedUpdates.lead_type === "international"
      ? normalizedUpdates.lead_type
      : null;
  const tripTypeValue =
    normalizedUpdates.trip_type === "domestic" || normalizedUpdates.trip_type === "international"
      ? normalizedUpdates.trip_type
      : null;

  if (leadTypeValue && !tripTypeValue) {
    normalizedUpdates.trip_type = leadTypeValue;
  }

  if (tripTypeValue && !leadTypeValue) {
    normalizedUpdates.lead_type = tripTypeValue;
  }

  if ((normalizedUpdates.trip_slug || "").trim() && !normalizedUpdates.lead_type && !normalizedUpdates.trip_type) {
    const inferred = inferTripType(normalizedUpdates.trip_slug || null);
    normalizedUpdates.lead_type = inferred;
    normalizedUpdates.trip_type = inferred;
  }

  const { data: previousLead } = await supabase
    .from("leads")
    .select("trip_slug, lead_type, trip_type")
    .eq("id", leadId)
    .maybeSingle();

  const { error } = await supabase
    .from("leads")
    .update(normalizedUpdates)
    .eq("id", leadId);

  if (error) {
    console.error("Error updating lead details:", error);
    throw new Error("Failed to update lead details");
  }

  await Promise.all(
    Object.entries(normalizedUpdates).map(async ([key, value]) => {
      await logLeadActivity({
        leadId,
        actorId: user.id,
        eventType: key === "trip_slug" ? "field_updated" : "field_updated",
        message: `${key.replace(/_/g, " ")} updated`,
        fieldName: key,
        beforeValue: previousLead?.[key as keyof typeof previousLead] != null
          ? String(previousLead[key as keyof typeof previousLead])
          : null,
        afterValue: value != null ? String(value) : null,
      });
    })
  );

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard/leads");
  return true;
}

export async function backfillMissingLeadTrips() {
  const { supabase, profile } = await requireRequestContext();
  if (!isManagerRole(profile.role)) {
    throw new Error("Only managers/admin can run trip backfill");
  }

  const [{ data: trips, error: tripsError }, { data: leads, error: leadsError }] = await Promise.all([
    supabase.from("trips").select("id, slug, title, trip_type, active"),
    supabase
      .from("leads")
      .select("id, page_url, utm_campaign, trip_slug, trip_id, trip_type")
      .or('trip_slug.is.null,trip_slug.eq."",trip_type.is.null')
      .limit(2000),
  ]);

  if (tripsError) {
    throw new Error(tripsError.message);
  }
  if (leadsError) {
    throw new Error(leadsError.message);
  }

  const tripMap = new Map<
    string,
    { id: string; slug: string; title: string | null; trip_type: "domestic" | "international" | null }
  >();
  for (const trip of trips || []) {
    if (!trip.slug) continue;
    tripMap.set(String(trip.slug).toLowerCase(), {
      id: String(trip.id),
      slug: String(trip.slug),
      title: (trip.title as string | null) || null,
      trip_type:
        trip.trip_type === "domestic" || trip.trip_type === "international"
          ? (trip.trip_type as "domestic" | "international")
          : inferTripType((trip.title as string | null) || String(trip.slug)),
    });
  }

  const updates: {
    id: string;
    trip_id: string | null;
    trip_slug: string | null;
    lead_type: string;
    trip_type: "domestic" | "international" | null;
  }[] = [];
  let inspected = 0;
  let matched = 0;
  let skipped = 0;

  for (const row of leads || []) {
    inspected += 1;
    const existingSlug = String(row.trip_slug || "").trim();
    const existingTripType =
      row.trip_type === "domestic" || row.trip_type === "international"
        ? (row.trip_type as "domestic" | "international")
        : null;

    const fromUrl = extractTripSlugFromUrl((row.page_url as string | null) || null);
    const fromCampaign = String(row.utm_campaign || "").trim().toLowerCase() || null;
    const candidate = existingSlug || fromUrl || fromCampaign;

    if (!candidate) {
      skipped += 1;
      continue;
    }

    const trip = tripMap.get(candidate.toLowerCase());
    if (!trip && existingTripType) {
      skipped += 1;
      continue;
    }

    if (!trip) {
      updates.push({
        id: String(row.id),
        trip_id: (row.trip_id as string | null) || null,
        trip_slug: existingSlug || null,
        lead_type: "trip",
        trip_type: inferTripType(candidate),
      });
      matched += 1;
      continue;
    }

    const nextTripType = trip.trip_type || inferTripType(trip.title || trip.slug);

    updates.push({
      id: String(row.id),
      trip_id: trip.id,
      trip_slug: trip.slug,
      lead_type: "trip",
      trip_type: nextTripType,
    });
    matched += 1;
  }

  if (updates.length === 0) {
    return { inspected, matched: 0, updated: 0, skipped };
  }

  const chunkSize = 300;
  let updated = 0;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const { error } = await supabase.from("leads").upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(error.message);
    }
    updated += chunk.length;
  }

  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
  return { inspected, matched, updated, skipped };
}
