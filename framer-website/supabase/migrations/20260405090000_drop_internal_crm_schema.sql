-- CRM reset migration (irreversible by design)
-- Purpose: clean-sweep CRM objects while preserving website systems, including public.leads.

begin;

-- Remove CRM hooks from public tables first.
drop trigger if exists crm_sync_public_leads_trigger on public.leads;
drop trigger if exists crm_set_public_lead_updated_at on public.leads;
drop trigger if exists crm_convert_from_booking_trigger on public.bookings;

-- Drop CRM schema and all dependent CRM objects.
drop schema if exists crm cascade;

commit;
