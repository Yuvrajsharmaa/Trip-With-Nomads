#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function runSupabaseQuery(sql) {
  const raw = execFileSync(
    "supabase",
    ["db", "query", "--linked", "-o", "json", sql],
    { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] }
  ).trim();

  const parsed = JSON.parse(raw || "[]");
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.rows)) return parsed.rows;
  return [];
}

function ensureLeadsColumns() {
  const rows = runSupabaseQuery(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'leads'
      and column_name in (
        'country_code',
        'normalized_phone',
        'normalized_email',
        'crm_status',
        'allotted_to',
        'escalated_to',
        'escalation_reason',
        'escalated_at'
      )
  `);

  const found = new Set(rows.map((row) => String(row.column_name)));
  const required = [
    "country_code",
    "normalized_phone",
    "normalized_email",
    "crm_status",
    "allotted_to",
    "escalated_to",
    "escalation_reason",
    "escalated_at",
  ];
  return required.filter((column) => !found.has(column));
}

function ensureLeadNotesTable() {
  const rows = runSupabaseQuery(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'lead_notes'
  `);
  return rows.length === 0 ? ["lead_notes"] : [];
}

function ensureCrmTables() {
  const rows = runSupabaseQuery(`
    select table_name
    from information_schema.tables
    where table_schema = 'crm'
      and table_name in (
        'lead_activity',
        'lead_duplicates',
        'notifications',
        'profiles',
        'tasks',
        'team_goals',
        'team_invitations',
        'teams',
        'weekly_off_requests'
      )
  `);

  const found = new Set(rows.map((row) => String(row.table_name)));
  const required = [
    "lead_activity",
    "lead_duplicates",
    "notifications",
    "profiles",
    "tasks",
    "team_goals",
    "team_invitations",
    "teams",
    "weekly_off_requests",
  ];
  return required.filter((table) => !found.has(table));
}

function ensureFunctions() {
  const rows = runSupabaseQuery(`
    select proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where (
      n.nspname = 'public'
      and p.proname in ('normalize_email', 'normalize_phone', 'set_lead_normalized_identity')
    ) or (
      n.nspname = 'crm'
      and p.proname in ('get_my_role', 'is_manager_or_admin', 'merge_duplicate_leads')
    )
  `);

  const found = new Set(rows.map((row) => String(row.proname)));
  const required = [
    "normalize_email",
    "normalize_phone",
    "set_lead_normalized_identity",
    "get_my_role",
    "is_manager_or_admin",
    "merge_duplicate_leads",
  ];
  return required.filter((name) => !found.has(name));
}

function ensureTriggers() {
  const rows = runSupabaseQuery(`
    select tgname
    from pg_trigger
    where tgrelid in ('public.leads'::regclass, 'crm.tasks'::regclass, 'crm.team_goals'::regclass, 'crm.team_invitations'::regclass)
      and not tgisinternal
      and tgname in (
        'set_leads_normalized_identity',
        'set_leads_updated_at',
        'tasks_updated_at',
        'trg_team_goals_updated_at',
        'trg_team_invitations_updated_at'
      )
  `);

  const found = new Set(rows.map((row) => String(row.tgname)));
  const required = [
    "set_leads_normalized_identity",
    "set_leads_updated_at",
    "tasks_updated_at",
    "trg_team_goals_updated_at",
    "trg_team_invitations_updated_at",
  ];
  return required.filter((trigger) => !found.has(trigger));
}

function ensureEnums() {
  const rows = runSupabaseQuery(`
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'crm'
      and t.typname in ('lead_status', 'profile_status', 'trip_type', 'user_role', 'handoff_status')
  `);

  const found = new Set(rows.map((row) => String(row.typname)));
  const required = ["lead_status", "profile_status", "trip_type", "user_role", "handoff_status"];
  return required.filter((enumType) => !found.has(enumType));
}

function main() {
  const missingLeadsColumns = ensureLeadsColumns();
  const missingLeadNotesTable = ensureLeadNotesTable();
  const missingCrmTables = ensureCrmTables();
  const missingFunctions = ensureFunctions();
  const missingTriggers = ensureTriggers();
  const missingEnums = ensureEnums();

  const missing = [
    ...missingLeadsColumns.map((item) => `column:public.leads.${item}`),
    ...missingLeadNotesTable.map((item) => `table:public.${item}`),
    ...missingCrmTables.map((item) => `table:crm.${item}`),
    ...missingFunctions.map((item) => `function:${item}`),
    ...missingTriggers.map((item) => `trigger:${item}`),
    ...missingEnums.map((item) => `enum:crm.${item}`),
  ];

  if (missing.length > 0) {
    console.error("CRM schema parity check failed. Missing objects:");
    for (const item of missing) console.error(`- ${item}`);
    process.exit(1);
  }

  console.log("CRM schema parity check passed.");
}

main();
