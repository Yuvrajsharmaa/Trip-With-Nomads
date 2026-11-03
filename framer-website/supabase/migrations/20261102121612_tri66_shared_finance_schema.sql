begin;

alter table if exists public.trips
  add column if not exists finance_issuer text;

alter table if exists public.bookings
  add column if not exists finance_issuer text;

do $$
begin
  if to_regclass('public.trips') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trips'::regclass
      and conname = 'trips_finance_issuer_check'
  ) then
    alter table public.trips
      add constraint trips_finance_issuer_check
      check (finance_issuer in ('TWN', 'NTC'));
  end if;

  if to_regclass('public.bookings') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_finance_issuer_check'
  ) then
    alter table public.bookings
      add constraint bookings_finance_issuer_check
      check (finance_issuer in ('TWN', 'NTC'));
  end if;
end;
$$;

create index if not exists trips_finance_issuer_idx
  on public.trips (finance_issuer)
  where finance_issuer is not null;

create index if not exists bookings_finance_issuer_idx
  on public.bookings (finance_issuer)
  where finance_issuer is not null;

alter table if exists public.payment_events
  add column if not exists finance_sync_status text not null default 'not_required',
  add column if not exists finance_sync_attempts integer not null default 0,
  add column if not exists finance_sync_last_attempt_at timestamptz,
  add column if not exists finance_synced_at timestamptz,
  add column if not exists finance_error text,
  add column if not exists finance_event_payload jsonb;

do $$
begin
  if to_regclass('public.payment_events') is not null and not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_events'::regclass
      and conname = 'payment_events_finance_sync_status_check'
  ) then
    alter table public.payment_events
      add constraint payment_events_finance_sync_status_check
      check (finance_sync_status in ('not_required', 'pending', 'synced', 'failed'));
  end if;
end;
$$;

create index if not exists payment_events_finance_sync_idx
  on public.payment_events (finance_sync_status, processing_status);

notify pgrst, 'reload schema';

commit;
