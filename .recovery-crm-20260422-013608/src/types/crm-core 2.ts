import type { CRMRole } from "@/types/roles";

export interface AssignableAgent {
  id: string;
  full_name: string;
  role: CRMRole;
}

export interface PendingUserApproval {
  id: string;
  full_name: string;
  email: string;
  role: CRMRole | null;
  status: "pending" | "active" | "suspended";
  created_at: string;
  team_id: string | null;
}

export interface PendingWeeklyOffApproval {
  id: string;
  user_id: string;
  requested_week_start: string;
  requested_day_of_week: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  user_name: string;
  user_role: CRMRole | null;
}
