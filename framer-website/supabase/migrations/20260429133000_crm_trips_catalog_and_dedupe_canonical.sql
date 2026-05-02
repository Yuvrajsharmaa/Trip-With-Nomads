begin;

create table if not exists crm.trips_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  trip_type text null check (trip_type in ('domestic','international')),
  is_active boolean not null default true,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid null references crm.profiles(id) on delete set null,
  updated_by uuid null references crm.profiles(id) on delete set null,
  constraint trips_catalog_slug_unique unique (slug)
);

create index if not exists trips_catalog_active_title_idx
  on crm.trips_catalog (is_active, title);

alter table crm.trips_catalog enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'crm' and tablename = 'trips_catalog' and policyname = 'trips_catalog_select_authenticated'
  ) then
    create policy trips_catalog_select_authenticated
      on crm.trips_catalog
      for select
      using (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'crm' and tablename = 'trips_catalog' and policyname = 'trips_catalog_write_manager'
  ) then
    create policy trips_catalog_write_manager
      on crm.trips_catalog
      for all
      using (crm.is_manager_or_admin())
      with check (crm.is_manager_or_admin());
  end if;
end $$;

grant select, insert, update, delete on crm.trips_catalog to authenticated, service_role;

alter table public.leads
  add column if not exists trip_catalog_id uuid references crm.trips_catalog(id) on delete set null;

create index if not exists leads_trip_catalog_id_idx on public.leads (trip_catalog_id);

-- sanitize invalid and duplicate normalized identities before unique partial indexes
update public.leads
set normalized_phone = null
where normalized_phone is not null
  and (
    btrim(normalized_phone) = ''
    or length(normalized_phone) <= 3
  );

with ranked_phone as (
  select
    id,
    row_number() over (
      partition by normalized_phone
      order by created_at asc, id asc
    ) as rn
  from public.leads
  where normalized_phone is not null
    and btrim(normalized_phone) <> ''
    and crm_status not in ('won'::crm.lead_status, 'dropped'::crm.lead_status, 'archived'::crm.lead_status)
)
update public.leads l
set normalized_phone = null
from ranked_phone rp
where l.id = rp.id
  and rp.rn > 1;

with ranked_email as (
  select
    id,
    row_number() over (
      partition by normalized_email
      order by created_at asc, id asc
    ) as rn
  from public.leads
  where normalized_email is not null
    and btrim(normalized_email) <> ''
    and crm_status not in ('won'::crm.lead_status, 'dropped'::crm.lead_status, 'archived'::crm.lead_status)
)
update public.leads l
set normalized_email = null
from ranked_email re
where l.id = re.id
  and re.rn > 1;

drop index if exists public.leads_active_normalized_phone_uidx;
drop index if exists public.leads_active_normalized_email_uidx;

create unique index if not exists leads_active_normalized_phone_uidx
  on public.leads (normalized_phone)
  where normalized_phone is not null
    and btrim(normalized_phone) <> ''
    and crm_status not in ('won'::crm.lead_status, 'dropped'::crm.lead_status, 'archived'::crm.lead_status);

create unique index if not exists leads_active_normalized_email_uidx
  on public.leads (normalized_email)
  where normalized_email is not null
    and btrim(normalized_email) <> ''
    and crm_status not in ('won'::crm.lead_status, 'dropped'::crm.lead_status, 'archived'::crm.lead_status);

commit;
