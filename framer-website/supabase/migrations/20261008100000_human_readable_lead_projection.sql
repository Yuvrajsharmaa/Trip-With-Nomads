-- Durable lead projection state for the sales-facing Sheet contracts.
-- This migration adds no Google Sheet tabs or workbooks.

alter table if exists public.leads
    add column if not exists company_name text,
    add column if not exists latest_activity text,
    add column if not exists latest_itinerary_name text,
    add column if not exists downloaded_itineraries jsonb not null default '[]'::jsonb;

alter table if exists public.lead_submissions
    add column if not exists activity_type text,
    add column if not exists itinerary_name text;

alter table if exists public.lead_submissions
    drop constraint if exists lead_submissions_sheet_sync_status_check;

alter table if exists public.lead_submissions
    add constraint lead_submissions_sheet_sync_status_check
    check (sheet_sync_status in ('pending', 'synced', 'failed', 'configuration_missing'));

create table if not exists public.lead_sheet_projection_attempts (
    id uuid primary key default gen_random_uuid(),
    submission_id uuid not null references public.lead_submissions(submission_id) on delete cascade,
    sheet_id text not null,
    tab text not null,
    projection_type text not null
        check (projection_type in ('current', 'history', 'master')),
    projection_key text not null,
    status text not null default 'pending'
        check (status in ('pending', 'synced', 'failed', 'configuration_missing')),
    row_fingerprint text,
    attempt_count integer not null default 0,
    last_attempt_at timestamptz,
    synced_at timestamptz,
    error_message text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (submission_id, sheet_id, tab, projection_type)
);

create index if not exists lead_sheet_projection_attempts_status_idx
    on public.lead_sheet_projection_attempts (status, updated_at);

create index if not exists lead_sheet_projection_attempts_key_idx
    on public.lead_sheet_projection_attempts (projection_key, tab);

alter table public.lead_sheet_projection_attempts enable row level security;
revoke all on public.lead_sheet_projection_attempts from anon, authenticated;
grant all on public.lead_sheet_projection_attempts to service_role;
