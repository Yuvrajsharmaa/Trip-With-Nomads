"use server";

import { requireRequestContext } from "@/lib/auth/request-context";
import { revalidatePath } from "next/cache";
import type { Task, TaskPriority, TaskStatus } from "@/types/tasks";
import { logLeadActivity } from "@/lib/actions/lead-activity";
import { isManagerRole } from "@/types/roles";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function coerceTask(row: TaskRow, leadName?: string, assigneeName?: string): Task {
  return {
    ...row,
    lead_name: leadName ?? null,
    assignee_name: assigneeName ?? null,
  };
}

export async function fetchTasks(opts?: {
  status?: TaskStatus | "all";
  priority?: TaskPriority | "all";
  leadId?: string;
  assignedToMe?: boolean;
}): Promise<Task[]> {
  const { supabase, user, profile } = await requireRequestContext();

  let query = supabase
    .schema("crm")
    .from("tasks")
    .select("*")
    .order("due_at", { ascending: true, nullsFirst: false });

  if (opts?.status && opts.status !== "all") {
    query = query.eq("status", opts.status);
  }
  if (opts?.priority && opts.priority !== "all") {
    query = query.eq("priority", opts.priority);
  }
  if (opts?.leadId) {
    query = query.eq("lead_id", opts.leadId);
  }
  const assignedToMe = opts?.assignedToMe ?? true;
  if (assignedToMe || !isManagerRole(profile.role)) {
    query = query.eq("assigned_to", user.id);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as TaskRow[];

  // Fetch lead names
  const leadIds = Array.from(new Set(rows.map((r) => r.lead_id).filter(Boolean))) as string[];
  const { data: leads } = leadIds.length
    ? await supabase.from("leads").select("id, name").in("id", leadIds)
    : { data: [] };
  const leadMap = new Map((leads ?? []).map((l: { id: string; name: string }) => [l.id, l.name]));

  // Fetch assignee names
  const agentIds = Array.from(new Set(rows.map((r) => r.assigned_to).filter(Boolean))) as string[];
  const { data: profiles } = agentIds.length
    ? await supabase.schema("crm").from("profiles").select("id, full_name").in("id", agentIds)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));

  return rows.map((row) =>
    coerceTask(row, leadMap.get(row.lead_id ?? "") ?? undefined, profileMap.get(row.assigned_to ?? "") ?? undefined)
  );
}

export async function createTask(params: {
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  due_at?: string | null;
  lead_id?: string | null;
  assigned_to?: string | null;
}): Promise<void> {
  const { supabase, user } = await requireRequestContext();

  const { data: insertedTask, error } = await supabase.schema("crm").from("tasks").insert({
    title: params.title,
    description: params.description ?? null,
    priority: params.priority,
    status: params.status,
    due_at: params.due_at ?? null,
    lead_id: params.lead_id ?? null,
    assigned_to: params.assigned_to ?? null,
    created_by: user.id,
  }).select("id, lead_id").single();

  if (error) throw new Error(error.message);

  if (insertedTask?.lead_id) {
    await logLeadActivity({
      leadId: insertedTask.lead_id,
      actorId: user.id,
      eventType: "task_created",
      message: `Task created: ${params.title}`,
      metadata: {
        task_id: insertedTask.id,
        priority: params.priority,
        status: params.status,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function updateTask(params: {
  taskId: string;
  updates: Partial<{
    title: string;
    description: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    due_at: string | null;
    lead_id: string | null;
    assigned_to: string | null;
  }>;
}): Promise<void> {
  const { supabase, user } = await requireRequestContext();

  const { data: previousTask } = await supabase
    .schema("crm")
    .from("tasks")
    .select("lead_id, title, priority, status")
    .eq("id", params.taskId)
    .maybeSingle();

  const { error } = await supabase
    .schema("crm")
    .from("tasks")
    .update(params.updates)
    .eq("id", params.taskId);

  if (error) throw new Error(error.message);

  if (previousTask?.lead_id) {
    await logLeadActivity({
      leadId: previousTask.lead_id,
      actorId: user.id,
      eventType: "task_updated",
      message: `Task updated: ${previousTask.title}`,
      metadata: {
        task_id: params.taskId,
        updates: params.updates,
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function deleteTask(taskId: string): Promise<void> {
  const { supabase, user } = await requireRequestContext();

  const { data: previousTask } = await supabase
    .schema("crm")
    .from("tasks")
    .select("lead_id, title")
    .eq("id", taskId)
    .maybeSingle();

  const { error } = await supabase
    .schema("crm")
    .from("tasks")
    .delete()
    .eq("id", taskId);

  if (error) throw new Error(error.message);

  if (previousTask?.lead_id) {
    await logLeadActivity({
      leadId: previousTask.lead_id,
      actorId: user.id,
      eventType: "task_deleted",
      message: `Task deleted: ${previousTask.title}`,
      metadata: { task_id: taskId },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function getTaskCounts(): Promise<{
  total: number;
  todo: number;
  in_progress: number;
  done: number;
}> {
  const { supabase, user } = await requireRequestContext();
  if (!user) return { total: 0, todo: 0, in_progress: 0, done: 0 };

  const { data } = await supabase
    .schema("crm")
    .from("tasks")
    .select("status")
    .eq("assigned_to", user.id);

  const rows = (data ?? []) as { status: TaskStatus }[];
  return {
    total: rows.length,
    todo: rows.filter((r) => r.status === "todo").length,
    in_progress: rows.filter((r) => r.status === "in_progress").length,
    done: rows.filter((r) => r.status === "done").length,
  };
}
