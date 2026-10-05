-- Durable lead identity and submission idempotency state. These are internal
-- Supabase tables; no Google Sheet tabs are added by this migration.

alter table if exists public.leads
    add column if not exists first_seen_at timestamptz,
    add column if not exists last_seen_at timestamptz,
    add column if not exists updated_at timestamptz,
    add column if not exists instagram_id text,
    add column if not exists latest_source text,
    add column if not exists latest_page_url text,
    add column if not exists latest_trip_id text,
    add column if not exists latest_trip_slug text,
    add column if not exists latest_utm_source text,
    add column if not exists latest_utm_medium text,
    add column if not exists latest_utm_campaign text,
    add column if not exists latest_utm_term text,
    add column if not exists latest_utm_content text,
    add column if not exists submission_count integer not null default 0,
    add column if not exists current_status text,
    add column if not exists latest_submission_id uuid,
    add column if not exists notes text;

create table if not exists public.lead_identities (
    id uuid primary key default gen_random_uuid(),
    normalized_email text not null unique,
    lead_id text not null,
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.lead_submissions (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null unique,
    lead_id text,
    normalized_email text,
    source text not null,
    status text not null default 'submitted',
    payload_hash text not null,
    payload jsonb not null default '{}'::jsonb,
    sheet_sync_status text not null default 'pending'
        check (sheet_sync_status in ('pending', 'synced', 'failed', 'not_required')),
    sheet_synced_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists lead_identities_lead_id_idx
    on public.lead_identities (lead_id);
create index if not exists lead_submissions_lead_id_idx
    on public.lead_submissions (lead_id);
create index if not exists lead_submissions_normalized_email_idx
    on public.lead_submissions (normalized_email);

create or replace function public.reconcile_lead_submission_count(target_lead_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    next_count integer;
begin
    select count(*)::integer
      into next_count
      from public.lead_submissions
     where lead_id = target_lead_id;

    update public.leads
       set submission_count = next_count,
           updated_at = now()
     where id::text = target_lead_id;

    return next_count;
end;
$$;

revoke all on function public.reconcile_lead_submission_count(text) from public;
grant execute on function public.reconcile_lead_submission_count(text) to service_role;

alter table public.lead_identities enable row level security;
alter table public.lead_submissions enable row level security;
revoke all on public.lead_identities from anon, authenticated;
revoke all on public.lead_submissions from anon, authenticated;
grant all on public.lead_identities to service_role;
grant all on public.lead_submissions to service_role;
