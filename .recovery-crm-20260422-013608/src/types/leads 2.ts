// Lead status enum matching crm.lead_status in Supabase
export const LEAD_STATUSES = [
  "new",
  "claimed",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "follow_up_4",
  "final_call",
  "won",
  "dropped",
  "handed_off",
  "archived",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

// The active pipeline statuses (what we show in the CRM)
export const PIPELINE_STATUSES: LeadStatus[] = [
  "new",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "follow_up_4",
  "final_call",
];

// Sales pipeline dashboard stages exclude the pre-assignment "new" stage.
export const SALES_PIPELINE_STATUSES: LeadStatus[] = [
  "claimed",
  "follow_up_1",
  "follow_up_2",
  "follow_up_3",
  "follow_up_4",
  "final_call",
];


export const TERMINAL_STATUSES: LeadStatus[] = ["won", "dropped"];

export interface Lead {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  normalized_phone?: string | null;
  source: string | null;
  status: string | null; // website-level status
  page_url: string | null;
  trip_id: string | null;
  trip_slug: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  created_at: string;
  updated_at: string;
  // CRM columns
  crm_status: LeadStatus;
  allotted_to: string | null;
  team_id: string | null;
  lead_type: string | null;
  trip_type: "domestic" | "international" | null;
  last_follow_up_at: string | null;
  next_follow_up_at: string | null;
  follow_up_count: number;
  drop_reason: string | null;
  dropped_at: string | null;
  won_at: string | null;
  escalated_to: string | null;
  escalation_reason: string | null;
  escalated_at: string | null;
  // Joined data (optional)
  agent_name?: string | null;
  owner_name?: string | null;
  owner_role?: string | null;
  completeness_score?: number;
}

// Status display config — one place for label + color
export const STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; dot: string; text: string; bg: string; border: string }
> = {
  new: {
    label: "New",
    dot: "bg-[var(--crm-lead-new-dot)]",
    text: "text-[var(--crm-lead-new-fg)]",
    bg: "bg-[var(--crm-lead-new-bg)]",
    border: "border-[var(--crm-lead-new-border)]",
  },
  claimed: {
    label: "Assigned",
    dot: "bg-[var(--crm-lead-claimed-dot)]",
    text: "text-[var(--crm-lead-claimed-fg)]",
    bg: "bg-[var(--crm-lead-claimed-bg)]",
    border: "border-[var(--crm-lead-claimed-border)]",
  },
  follow_up_1: {
    label: "F/Up 1",
    dot: "bg-[var(--crm-lead-fup1-dot)]",
    text: "text-[var(--crm-lead-fup1-fg)]",
    bg: "bg-[var(--crm-lead-fup1-bg)]",
    border: "border-[var(--crm-lead-fup1-border)]",
  },
  follow_up_2: {
    label: "F/Up 2",
    dot: "bg-[var(--crm-lead-fup2-dot)]",
    text: "text-[var(--crm-lead-fup2-fg)]",
    bg: "bg-[var(--crm-lead-fup2-bg)]",
    border: "border-[var(--crm-lead-fup2-border)]",
  },
  follow_up_3: {
    label: "F/Up 3",
    dot: "bg-[var(--crm-lead-fup3-dot)]",
    text: "text-[var(--crm-lead-fup3-fg)]",
    bg: "bg-[var(--crm-lead-fup3-bg)]",
    border: "border-[var(--crm-lead-fup3-border)]",
  },
  follow_up_4: {
    label: "F/Up 4",
    dot: "bg-[var(--crm-lead-fup4-dot)]",
    text: "text-[var(--crm-lead-fup4-fg)]",
    bg: "bg-[var(--crm-lead-fup4-bg)]",
    border: "border-[var(--crm-lead-fup4-border)]",
  },
  final_call: {
    label: "Final",
    dot: "bg-[var(--crm-lead-final-dot)]",
    text: "text-[var(--crm-lead-final-fg)]",
    bg: "bg-[var(--crm-lead-final-bg)]",
    border: "border-[var(--crm-lead-final-border)]",
  },
  won: {
    label: "Won",
    dot: "bg-[var(--crm-lead-won-dot)]",
    text: "text-[var(--crm-lead-won-fg)]",
    bg: "bg-[var(--crm-lead-won-bg)]",
    border: "border-[var(--crm-lead-won-border)]",
  },
  dropped: {
    label: "Dropped",
    dot: "bg-[var(--crm-lead-dropped-dot)]",
    text: "text-[var(--crm-lead-dropped-fg)]",
    bg: "bg-[var(--crm-lead-dropped-bg)]",
    border: "border-[var(--crm-lead-dropped-border)]",
  },
  handed_off: {
    label: "Handed Off",
    dot: "bg-[var(--crm-lead-handoff-dot)]",
    text: "text-[var(--crm-lead-handoff-fg)]",
    bg: "bg-[var(--crm-lead-handoff-bg)]",
    border: "border-[var(--crm-lead-handoff-border)]",
  },
  archived: {
    label: "Archived",
    dot: "bg-[var(--crm-lead-archived-dot)]",
    text: "text-[var(--crm-lead-archived-fg)]",
    bg: "bg-[var(--crm-lead-archived-bg)]",
    border: "border-[var(--crm-lead-archived-border)]",
  },
};

// Filter tab definitions
export type LeadFilter = "all" | "unassigned" | "my_leads" | "won_dropped" | "archived" | "duplicates";

export const LEAD_FILTER_TABS: { key: LeadFilter; label: string }[] = [
  { key: "all", label: "All Leads" },
  { key: "unassigned", label: "Unassigned" },
  { key: "my_leads", label: "My Leads" },
  { key: "won_dropped", label: "Won / Dropped" },
  { key: "archived", label: "Archived" },
  { key: "duplicates", label: "Duplicates" },
];
