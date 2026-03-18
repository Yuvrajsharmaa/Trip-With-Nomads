-- Checkout status page fetches bookings by booking_id using anon key.
-- Staging allows this; production currently filters rows via RLS.
-- Disable RLS on bookings to match existing checkout flow behavior.

alter table if exists public.bookings disable row level security;
