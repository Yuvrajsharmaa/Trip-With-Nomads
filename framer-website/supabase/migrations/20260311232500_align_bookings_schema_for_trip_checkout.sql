-- Align legacy public.bookings table with trip-checkout fields used by
-- create-booking / handle-payment / booking status overrides.
-- This migration is idempotent and safe to run on both staging and prod.

alter table if exists public.bookings
    add column if not exists booking_ref text,
    add column if not exists trip_id uuid,
    add column if not exists departure_date date,
    add column if not exists transport text,
    add column if not exists travellers jsonb not null default '[]'::jsonb,
    add column if not exists payment_breakdown jsonb not null default '[]'::jsonb,
    add column if not exists subtotal_amount numeric not null default 0,
    add column if not exists discount_amount numeric not null default 0,
    add column if not exists coupon_code text,
    add column if not exists coupon_snapshot jsonb,
    add column if not exists tax_amount numeric not null default 0,
    add column if not exists total_amount numeric not null default 0,
    add column if not exists currency text not null default 'INR',
    add column if not exists payment_status text not null default 'pending',
    add column if not exists payment_mode text not null default 'full',
    add column if not exists payable_now_amount numeric not null default 0,
    add column if not exists paid_amount numeric not null default 0,
    add column if not exists due_amount numeric not null default 0,
    add column if not exists settlement_status text not null default 'pending',
    add column if not exists balance_due_note text,
    add column if not exists payu_txnid text,
    add column if not exists payu_mihpayid text,
    add column if not exists name text,
    add column if not exists email text,
    add column if not exists phone text;
do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'user_id'
    ) then
        execute 'alter table public.bookings alter column user_id drop not null';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'therapist_id'
    ) then
        execute 'alter table public.bookings alter column therapist_id drop not null';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'scheduled_start_at'
    ) then
        execute 'alter table public.bookings alter column scheduled_start_at drop not null';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'scheduled_end_at'
    ) then
        execute 'alter table public.bookings alter column scheduled_end_at drop not null';
    end if;
end $$;
create index if not exists bookings_trip_id_idx on public.bookings(trip_id);
create index if not exists bookings_departure_date_idx on public.bookings(departure_date);
create index if not exists bookings_payu_txnid_idx on public.bookings(payu_txnid);
create index if not exists bookings_booking_ref_idx on public.bookings(booking_ref);
create index if not exists bookings_coupon_code_idx on public.bookings(coupon_code);
