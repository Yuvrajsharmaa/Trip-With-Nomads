import type { Lead, LeadStatus } from "@/types/leads";
import type { TaskPriority, TaskStatus } from "@/types/tasks";

export const DASHBOARD_PIPELINE_STAGE_ORDER = [
  "unassigned",
  "claimed",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "follow_up_4",
  "final_call",
] as const;

export type DashboardPipelineStageKey = (typeof DASHBOARD_PIPELINE_STAGE_ORDER)[number];
export type DashboardPipelineBreakdown = Partial<Record<DashboardPipelineStageKey, number>>;

export interface DueTask {
  id: string;
  lead_id: string;
  title: string;
  due_at: string;
  priority: "low" | "medium" | "high";
  status: LeadStatus;
  lead: Pick<Lead, "id" | "name" | "phone" | "trip_slug" | "crm_status" | "allotted_to">;
}

export interface PipelineOwnerBreakdown {
  owner_id: string;
  owner_name: string;
  total: number;
  pipeline_breakdown: DashboardPipelineBreakdown;
}

export interface DashboardInsights {
  open_leads: number;
  my_open_leads: number;
  unassigned_leads: number;
  escalated_open: number;
  overdue_followups: number;
  due_today: number;
  won_this_week: number;
  dropped_this_week: number;
  leads_by_source: Record<string, number>;
  leads_by_location: Record<string, number>;
  /** Count of active leads per dashboard pipeline stage */
  pipeline_breakdown: DashboardPipelineBreakdown;
  /** Optional stage mix per owner for role-scoped pipeline selectors */
  pipeline_by_owner: PipelineOwnerBreakdown[];
}

export type ManagerDashboardInsights = DashboardInsights;

export interface AgentDashboardInsights {
  my_active_leads: number;
  my_due_today: number;
  my_overdue_followups: number;
  my_won_this_week: number;
  my_dropped_this_week: number;
  my_pipeline_breakdown: DashboardPipelineBreakdown;
}

export interface AdminDashboardInsights extends DashboardInsights {
  pending_user_approvals: number;
  pending_weekly_off_approvals: number;
}

export type ClosedLeadsRange =
  | "today"
  | "yesterday"
  | "1w"
  | "1m"
  | "3m"
  | "6m"
  | "1y"
  | "custom";

export interface ClosedLeadsMetrics {
  range: ClosedLeadsRange;
  start_at: string;
  end_at: string;
  won: number;
  dropped: number;
  total: number;
}

export interface MetricDelta {
  current: number;
  previous: number;
  absolute_change: number;
  percent_change: number | null;
}

export interface TeamRangeComparison {
  won: MetricDelta;
  dropped: MetricDelta;
  tasks_done: MetricDelta;
  attendance_hours: MetricDelta;
}

export type UnifiedTaskSource = "crm_task" | "lead_follow_up";

export interface UnifiedTaskItem {
  id: string;
  source: UnifiedTaskSource;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string;
  pending_minutes: number;
  urgency_score: number;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_trip_slug: string | null;
  lead_status: LeadStatus | null;
  assigned_to: string | null;
  assignee_name: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}
