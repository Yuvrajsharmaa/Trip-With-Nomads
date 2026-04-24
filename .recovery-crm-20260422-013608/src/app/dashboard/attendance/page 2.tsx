import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import { resolveManagerScope } from "@/lib/auth/manager-scope";
import { getAttendanceTimeline, getTimeOffRequests, getWeeklyOffRequests } from "@/lib/actions/attendance";
import { AttendanceBoard } from "@/components/dashboard/attendance-board";
import { isManagerRole } from "@/types/roles";

interface AttendancePageProps {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
    agent?: string;
  }>;
}

type AttendanceRange = "1w" | "1m" | "3m" | "6m" | "1y" | "custom";

function toDateKey(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function resolveRange(range: AttendanceRange, customFrom?: string, customTo?: string) {
  const now = new Date();
  const end = toDateKey(now);
  const from = new Date(now);

  switch (range) {
    case "1m":
      from.setDate(from.getDate() - 29);
      break;
    case "3m":
      from.setDate(from.getDate() - 89);
      break;
    case "6m":
      from.setDate(from.getDate() - 179);
      break;
    case "1y":
      from.setDate(from.getDate() - 364);
      break;
    case "custom":
      return {
        from: customFrom || end,
        to: customTo || end,
      };
    case "1w":
    default:
      from.setDate(from.getDate() - 6);
      break;
  }

  return {
    from: toDateKey(from),
    to: end,
  };
}

export default async function AttendancePage({ searchParams }: AttendancePageProps) {
  const { user, profile, supabase } = await getRequestContext();
  if (!user) redirect("/login");

  if (!profile) redirect("/onboarding");
  if (profile.status === "pending") redirect("/pending-approval");
  if (profile.status === "suspended") redirect("/suspended");

  const params = await searchParams;
  const allowedRanges: AttendanceRange[] = ["1w", "1m", "3m", "6m", "1y", "custom"];
  const range = allowedRanges.includes((params.range || "1w") as AttendanceRange)
    ? ((params.range || "1w") as AttendanceRange)
    : "1w";
  const { from, to } = resolveRange(range, params.from, params.to);
  const isManager = isManagerRole(profile.role);
  const selectedAgent = params.agent || "all";

  const scope = isManager ? await resolveManagerScope(supabase, profile) : null;
  const agentOptions = isManager
    ? (
        scope?.canAccessAll
          ? (
              await supabase
                .schema("crm")
                .from("profiles")
                .select("id, full_name, team_id, role, status")
                .in("role", ["sales_agent", "sales_manager", "operations_manager", "finance_agent", "finance_manager"])
                .eq("status", "active")
                .order("full_name", { ascending: true })
            ).data || []
          : scope && scope.teamIds.length > 0
            ? (
                await supabase
                  .schema("crm")
                  .from("profiles")
                  .select("id, full_name, team_id, role, status")
                  .in("role", ["sales_agent", "sales_manager", "operations_manager", "finance_agent", "finance_manager"])
                  .eq("status", "active")
                  .in("team_id", scope.teamIds)
                  .order("full_name", { ascending: true })
              ).data || []
            : []
      ).map((row) => ({
        id: row.id as string,
        name: (row.full_name as string) || "Member",
      }))
    : [];

  const [timeline, timeOffRequests, weeklyOffRequests] = await Promise.all([
    getAttendanceTimeline({
      dateFrom: from,
      dateTo: to,
      agentId: selectedAgent !== "all" ? selectedAgent : undefined,
      limit: range === "1y" || range === "custom" ? 520 : 180,
    }),
    getTimeOffRequests(),
    getWeeklyOffRequests(),
  ]);

  return (
    <AttendanceBoard
      timeline={timeline}
      timeOffRequests={timeOffRequests}
      weeklyOffRequests={weeklyOffRequests}
      currentUserId={profile.id}
      initialRange={range}
      initialFrom={from}
      initialTo={to}
      agentOptions={agentOptions}
      initialAgent={selectedAgent}
    />
  );
}
