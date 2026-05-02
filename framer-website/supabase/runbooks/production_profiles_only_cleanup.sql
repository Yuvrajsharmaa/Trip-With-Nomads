begin;

-- Preserve auth.users + crm.profiles only.
-- Remove all lead-operational data from production.
truncate table public.lead_notes cascade;
truncate table crm.lead_activity cascade;
truncate table crm.lead_duplicates cascade;
truncate table crm.tasks cascade;
truncate table crm.notifications cascade;
truncate table crm.weekly_off_requests cascade;

delete from public.leads;

-- Optional org-data cleanup to keep profile records only.
update crm.profiles set team_id = null;
truncate table crm.team_goals cascade;
truncate table crm.team_invitations cascade;
truncate table crm.teams cascade;

commit;
