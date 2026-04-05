-- CRM readiness: canonical leads table used by record-lead edge function.
-- Keeps lead capture data in Supabase as source of truth while Sheets remain downstream.

begin;

create table if not exists public.leads (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    email text not null,
    name text,
    phone text,
    source text not null default 'waitlist_popup',
    page_url text,
    trip_id uuid references public.trips(id) on delete set null,
    trip_slug text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    status text not null default 'submitted',
    metadata jsonb not null default '{}'::jsonb
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_email_idx on public.leads (lower(email));
create index if not exists leads_source_idx on public.leads (source);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_trip_slug_idx on public.leads (trip_slug);

alter table public.leads enable row level security;

do $$
begin
    if exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'set_updated_at'
    ) then
        drop trigger if exists set_leads_updated_at on public.leads;
        create trigger set_leads_updated_at
            before update on public.leads
            for each row
            execute function public.set_updated_at();
    end if;
end $$;

commit;
