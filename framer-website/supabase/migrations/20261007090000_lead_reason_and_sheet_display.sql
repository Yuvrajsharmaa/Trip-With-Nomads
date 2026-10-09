-- Keep the latest reason and country code with the current lead identity so
-- every human-facing Sheet projection can show what the person submitted.
-- This is internal Supabase state; it does not create a Google Sheet tab.

alter table if exists public.leads
    add column if not exists latest_reason text;
