
-- Durable, idempotent internal booking-notification delivery ledger.
begin;

create table if not exists public.booking_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
  provider_event_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'not_required')),
  attempts integer not null default 0 check (attempts >= 0),
  recipients jsonb not null default '[]'::jsonb,
  idempotency_key text,
  provider_id text,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  error_message text,
  email_payload jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_notification_events_booking_id_idx
  on public.booking_notification_events (booking_id);

create index if not exists booking_notification_events_status_idx
  on public.booking_notification_events (status);

alter table public.booking_notification_events enable row level security;

revoke all on table public.booking_notification_events from anon, authenticated;
grant all on table public.booking_notification_events to service_role;

commit;
