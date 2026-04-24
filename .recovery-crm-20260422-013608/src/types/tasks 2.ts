export type TaskPriority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "in_progress" | "done";

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  lead_id: string | null;
  lead_name: string | null;
  assigned_to: string | null;
  assignee_name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  high: {
    label: "High",
    bg: "bg-[var(--crm-priority-high-bg)]",
    text: "text-[var(--crm-priority-high-fg)]",
    border: "border-[var(--crm-priority-high-border)]",
    dot: "bg-[var(--crm-priority-high-dot)]",
  },
  medium: {
    label: "Medium",
    bg: "bg-[var(--crm-priority-medium-bg)]",
    text: "text-[var(--crm-priority-medium-fg)]",
    border: "border-[var(--crm-priority-medium-border)]",
    dot: "bg-[var(--crm-priority-medium-dot)]",
  },
  low: {
    label: "Low",
    bg: "bg-[var(--crm-priority-low-bg)]",
    text: "text-[var(--crm-priority-low-fg)]",
    border: "border-[var(--crm-priority-low-border)]",
    dot: "bg-[var(--crm-priority-low-dot)]",
  },
};

export const STATUS_CONFIG_TASKS: Record<
  TaskStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  todo: {
    label: "To Do",
    bg: "bg-muted",
    text: "text-muted-foreground",
    border: "border-border",
  },
  in_progress: {
    label: "In Progress",
    bg: "bg-[var(--crm-task-progress-bg)]",
    text: "text-[var(--crm-task-progress-fg)]",
    border: "border-[var(--crm-task-progress-border)]",
  },
  done: {
    label: "Done",
    bg: "bg-[var(--crm-task-done-bg)]",
    text: "text-[var(--crm-task-done-fg)]",
    border: "border-[var(--crm-task-done-border)]",
  },
};

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
export const TASK_PRIORITIES: TaskPriority[] = ["high", "medium", "low"];
