begin;

-- Payment reconciliation and Sheet projection already have durable state. Keep
-- email delivery equally observable and retryable without making email part of
-- the payment authority.
alter table if exists public.payment_events
    add column if not exists email_sync_status text not null default 'not_required',
    add column if not exists email_attempts integer not null default 0,
    add column if not exists email_recipient text,
    add column if not exists email_idempotency_key text,
    add column if not exists email_provider_id text,
    add column if not exists email_sent_at timestamptz,
    add column if not exists email_last_attempt_at timestamptz,
    add column if not exists email_error text,
    add column if not exists email_payload jsonb,
    add column if not exists email_previous_state jsonb;

alter table public.payment_events
    drop constraint if exists payment_events_email_sync_status_check;
alter table public.payment_events
    add constraint payment_events_email_sync_status_check
    check (email_sync_status in ('not_required', 'pending', 'sent', 'failed'));

create index if not exists payment_events_email_sync_idx
    on public.payment_events (email_sync_status, processing_status);

commit;
