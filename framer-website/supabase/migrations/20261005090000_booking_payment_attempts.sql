begin;

-- Idempotency and provider-neutral payment state. The database remains the
-- source of truth; Google Sheets are projections of this state.
alter table if exists public.bookings
    add column if not exists checkout_request_id text,
    add column if not exists checkout_request_fingerprint text,
    add column if not exists active_payment_attempt_id uuid,
    add column if not exists payment_provider text,
    add column if not exists payment_gateway_order_or_ref_id text,
    add column if not exists payment_gateway_txn_id text,
    add column if not exists payment_gateway_payment_id text,
    add column if not exists payment_attempt_number integer not null default 1,
    add column if not exists last_payment_event_id text,
    add column if not exists last_payment_event_at timestamptz;

create unique index if not exists bookings_checkout_request_id_uidx
    on public.bookings (checkout_request_id)
    where checkout_request_id is not null and btrim(checkout_request_id) <> '';

create table if not exists public.payment_attempts (
    id uuid primary key default gen_random_uuid(),
    booking_id uuid not null references public.bookings(id) on delete cascade,
    attempt_no integer not null check (attempt_no > 0),
    idempotency_key text,
    provider text not null default 'unknown',
    provider_order_id text,
    provider_payment_id text,
    provider_transaction_id text,
    amount_minor bigint not null default 0 check (amount_minor >= 0),
    currency text not null default 'INR',
    status text not null default 'pending'
        check (status in ('creating', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'superseded', 'duplicate')),
    error_code text,
    error_message text,
    expires_at timestamptz,
    paid_at timestamptz,
    failed_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now()),
    unique (booking_id, attempt_no)
);

alter table public.payment_attempts
    add column if not exists idempotency_key text,
    add column if not exists provider text not null default 'unknown',
    add column if not exists provider_order_id text,
    add column if not exists provider_payment_id text,
    add column if not exists provider_transaction_id text,
    add column if not exists amount_minor bigint not null default 0,
    add column if not exists currency text not null default 'INR',
    add column if not exists status text not null default 'pending',
    add column if not exists error_code text,
    add column if not exists error_message text,
    add column if not exists expires_at timestamptz,
    add column if not exists paid_at timestamptz,
    add column if not exists failed_at timestamptz,
    add column if not exists created_at timestamptz not null default timezone('utc', now()),
    add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists payment_attempts_idempotency_key_uidx
    on public.payment_attempts (idempotency_key)
    where idempotency_key is not null and btrim(idempotency_key) <> '';

create unique index if not exists payment_attempts_provider_order_uidx
    on public.payment_attempts (provider, provider_order_id)
    where provider_order_id is not null and btrim(provider_order_id) <> '';

create unique index if not exists payment_attempts_provider_payment_uidx
    on public.payment_attempts (provider, provider_payment_id)
    where provider_payment_id is not null and btrim(provider_payment_id) <> '';

create index if not exists payment_attempts_booking_id_idx
    on public.payment_attempts (booking_id);

-- Only one payment attempt may be in flight for a booking. Failed and expired
-- attempts remain as history and can be followed by a new attempt.
create unique index if not exists payment_attempts_one_open_per_booking_uidx
    on public.payment_attempts (booking_id)
    where status in ('creating', 'pending');

create table if not exists public.payment_events (
    id uuid primary key default gen_random_uuid(),
    provider text not null,
    provider_event_id text not null,
    event_type text not null default 'unknown',
    booking_id uuid references public.bookings(id) on delete set null,
    payment_attempt_id uuid references public.payment_attempts(id) on delete set null,
    provider_order_id text,
    provider_payment_id text,
    provider_transaction_id text,
    amount_minor bigint,
    currency text,
    raw_body_sha256 text,
    verification_status text not null default 'received'
        check (verification_status in ('received', 'verified', 'invalid', 'ignored')),
    processing_status text not null default 'received'
        check (processing_status in ('received', 'processing', 'applied', 'ignored', 'failed')),
    sheet_sync_status text not null default 'pending'
        check (sheet_sync_status in ('not_required', 'pending', 'synced', 'failed')),
    reconciliation_result text,
    error_message text,
    notes text,
    received_at timestamptz not null default timezone('utc', now()),
    verified_at timestamptz,
    processed_at timestamptz,
    sheet_synced_at timestamptz,
    unique (provider, provider_event_id)
);

alter table public.payment_events
    add column if not exists reconciliation_result text,
    add column if not exists notes text;

-- Keep a stable constraint name when this migration is replayed against a
-- database that already has the earlier event table shape.
alter table public.payment_events
    drop constraint if exists payment_events_processing_status_check;
alter table public.payment_events
    add constraint payment_events_processing_status_check
    check (processing_status in ('received', 'processing', 'applied', 'ignored', 'failed'));

create index if not exists payment_events_booking_id_idx
    on public.payment_events (booking_id);

create index if not exists payment_events_sheet_sync_idx
    on public.payment_events (sheet_sync_status, processing_status);

alter table public.payment_attempts enable row level security;
alter table public.payment_events enable row level security;

revoke all on table public.payment_attempts from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;
grant all on table public.payment_attempts to service_role;
grant all on table public.payment_events to service_role;

commit;
