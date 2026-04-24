export type LocationType = 'WFO' | 'WFH';
export type AttendanceStatus = 'present' | 'leave_requested' | 'leave_approved' | 'absent';

export interface BreakLog {
  type: string;
  start: string; // ISO String
  end?: string; // ISO String
}

export interface AttendanceLog {
  id: string;
  agent_id: string;
  work_date: string;
  location_type: LocationType;
  clock_in: string | null;
  clock_out: string | null;
  breaks: BreakLog[];
  total_hours: number;
  status: AttendanceStatus;
  
  // joined info for managers
  agent_name?: string;
}

export interface TimeOffRequest {
  id: string;
  agent_id: string;
  requested_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  manager_id: string | null;
  created_at: string;
  
  agent_name?: string;
}

export interface WeeklyOffRequest {
  id: string;
  user_id: string;
  requested_week_start: string;
  requested_day_of_week: number;
  approved_day_of_week: number | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}
