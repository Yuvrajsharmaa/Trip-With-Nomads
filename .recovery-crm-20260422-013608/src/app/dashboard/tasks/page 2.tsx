import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import { fetchUnifiedDashboardTasks, listAssignableAgents } from "@/lib/actions/crm-core";
import { TasksPanel } from "@/components/dashboard/tasks-panel";
import { getTaskCounts } from "@/lib/actions/tasks";

export const metadata = {
  title: "Tasks — TWN Workspace",
  description: "Manage your tasks and follow-ups",
};

async function getLeadsList() {
  const { supabase } = await getRequestContext();
  const { data } = await supabase.from("leads").select("id, name").order("name", { ascending: true }).limit(500);
  return (data ?? []) as { id: string; name: string }[];
}

export default async function TasksPage() {
  const { user, profile } = await getRequestContext();
  if (!user) redirect("/login");
  if (!profile) redirect("/login");

  const [tasks, counts, agents, leads] = await Promise.all([
    fetchUnifiedDashboardTasks({ limit: 250, includeDone: true }),
    getTaskCounts(),
    listAssignableAgents(),
    getLeadsList(),
  ]);

  return (
    <TasksPanel
      initialTasks={tasks}
      counts={counts}
      agents={agents}
      leads={leads}
      currentUserId={user.id}
    />
  );
}
