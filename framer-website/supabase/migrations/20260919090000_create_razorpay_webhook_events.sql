-- Durable idempotency ledger for Razorpay webhook deliveries.
-- The public webhook function writes through the service role only.
create table if not exists public.razorpay_webhook_events (
    event_id text primary key,
    event_name text not null,
    order_id text,
    payment_id text,
    status text not null default 'processing'
        check (status in ('processing', 'processed', 'ignored', 'failed')),
    received_at timestamptz not null default timezone('utc', now()),
    processed_at timestamptz,
    error_message text
);

create index if not exists razorpay_webhook_events_order_id_idx
    on public.razorpay_webhook_events(order_id);

alter table public.razorpay_webhook_events enable row level security;

revoke all on table public.razorpay_webhook_events from anon, authenticated;
grant all on table public.razorpay_webhook_events to service_role;
