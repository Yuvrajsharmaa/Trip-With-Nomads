-- Lock down bookings table; public status reads now flow through
-- the get-booking-status edge function with signed status tokens.

alter table if exists public.bookings enable row level security;

drop policy if exists "anon_select_booking_by_id" on public.bookings;
drop policy if exists "Allow public read for bookings" on public.bookings;
drop policy if exists "Enable read access for bookings by ID" on public.bookings;
drop policy if exists "Enable public read access" on public.bookings;
drop policy if exists "public read bookings" on public.bookings;
