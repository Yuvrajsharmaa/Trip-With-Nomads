import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import { fetchLeads, getLeadCounts } from "@/lib/actions/leads";
import { listAssignableAgents } from "@/lib/actions/crm-core";
import { listDuplicateQueue } from "@/lib/actions/duplicates";
import { LeadsTable } from "@/components/dashboard/leads-table";
import { LeadQuickAdd } from "@/components/dashboard/lead-quick-add";
import { LeadsAdminTools } from "@/components/dashboard/leads-admin-tools";
import type { LeadFilter } from "@/types/leads";

interface LeadsPageProps {
  searchParams: Promise<{
    filter?: string;
    q?: string;
    source?: string;
    type?: string;
    followup?: string;
    owner?: string;
    team?: string;
    status?: string;
    created_from?: string;
    created_to?: string;
    page?: string;
  }>;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const { user, profile, supabase } = await getRequestContext();
  if (!user) redirect("/login");

  if (!profile) redirect("/onboarding");

  const params = await searchParams;
  const defaultFilter: LeadFilter = "all";
  const requestedFilter = (params.filter as LeadFilter) || defaultFilter;
  const search = params.q || "";
  const source = params.source || "all";
  const leadType = params.type || "all";
  const followup = params.followup || "all";
  const owner = params.owner || "all";
  const team = params.team || "all";
  const status = params.status || "all";
  const createdFrom = params.created_from || "";
  const createdTo = params.created_to || "";
  const page = Math.max(1, parseInt(params.page || "1", 10));

  const isManager = ["admin", "operations_manager", "sales_manager", "finance_manager"].includes(profile.role);
  const filter = !isManager && requestedFilter === "duplicates" ? "all" : requestedFilter;
  const leadsFilter = filter === "duplicates" ? "all" : filter;

  const duplicateQueuePromise = isManager
    ? listDuplicateQueue()
      .then((items) => ({ items, error: null as string | null }))
      .catch((error) => ({
        items: [],
        error: error instanceof Error ? error.message : "Unable to load duplicate queue.",
      }))
    : Promise.resolve({ items: [], error: null as string | null });

  const [leadsResult, counts, assignableUsers, duplicateQueueResult, teamRows, ownerRows] = await Promise.all([
    fetchLeads({
      filter: leadsFilter,
      userId: profile.id,
      search,
      source,
      leadType,
      followup,
      owner,
      team,
      status,
      createdFrom: createdFrom || undefined,
      createdTo: createdTo || undefined,
      page,
      pageSize: 25,
    }),
    getLeadCounts(profile.id),
    listAssignableAgents(),
    duplicateQueuePromise,
    supabase
      .schema("crm")
      .from("teams")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .schema("crm")
      .from("profiles")
      .select("id, full_name, status")
      .eq("status", "active")
      .order("full_name", { ascending: true }),
  ]);

  return (
    <div className="flex flex-1 flex-col transition-all duration-300 h-full overflow-y-auto min-h-0">

      <div className="sticky top-0 z-20 px-6 md:px-8 py-5 border-b border-border bg-background/80 backdrop-blur-md shrink-0 space-y-4">

        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-bold tracking-tight text-foreground leading-none">Leads Workspace</h1>
            <p className="text-xs text-muted-foreground font-medium">Track pipeline ownership, follow-ups, and duplicate-safe intake.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LeadQuickAdd assignableUsers={assignableUsers} isManager={isManager} />
          <LeadsAdminTools isManager={isManager} />
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4 md:p-6 lg:p-8 pt-4 md:pt-6">
        <LeadsTable
          initialLeads={leadsResult.leads}
          total={leadsResult.total}
          page={leadsResult.page}
          pageSize={leadsResult.pageSize}
          filter={filter}
          search={search}
          source={source}
          leadType={leadType}
          followup={followup}
          owner={owner}
          team={team}
          stage={status}
          createdFrom={createdFrom}
          createdTo={createdTo}
          counts={counts}
          currentUserId={profile.id}
          baseRoute="/dashboard/leads"
          showDuplicateTab={isManager}
          duplicateQueueItems={duplicateQueueResult.items}
          duplicateQueueError={duplicateQueueResult.error}
          duplicatePendingCount={counts.duplicates || 0}
          ownerOptions={(ownerRows.data || []).map((row) => ({
            id: row.id as string,
            name: (row.full_name as string) || "Member",
          }))}
          teamOptions={(teamRows.data || []).map((row) => ({
            id: row.id as string,
            name: row.name as string,
          }))}
        />
      </div>
    </div>
  );
}
