# CRM Reset Runbook (No Backup)

This runbook executes an irreversible CRM clean sweep while preserving website systems.

## Scope

- Drop all `crm.*` objects.
- Remove CRM triggers from `public.leads` and `public.bookings`.
- Keep website lead ingestion (`public.leads` + `record-lead`) operational.

## Required Order

1. Dev
2. Staging
3. Prod

Proceed to the next environment only after all gate checks pass.

## Pre-Reset Steps Per Environment

1. Deploy maintenance-mode CRM app (`internal-crm`).
2. Deploy maintenance stub versions of all `crm-*` edge functions.
3. Confirm website booking and lead capture endpoints remain healthy.

## Execute Reset Migration

Apply migration:

- `framer-website/supabase/migrations/20260405090000_drop_internal_crm_schema.sql`

The migration performs:

- `drop trigger if exists crm_sync_public_leads_trigger on public.leads`
- `drop trigger if exists crm_set_public_lead_updated_at on public.leads`
- `drop trigger if exists crm_convert_from_booking_trigger on public.bookings`
- `drop schema if exists crm cascade`

## Gate Checks (Must Pass)

1. Website lead capture still writes to `public.leads`.
2. `crm` schema does not exist.
3. No CRM triggers remain on `public.leads` or `public.bookings`.
4. `/functions/v1/crm-*` endpoints return controlled maintenance responses (503), not crashes.
5. Non-CRM website flows remain healthy.
6. No active CRM app routes expose old behavior.

## SQL Verification Snippets

```sql
-- 1) crm schema removed
select schema_name from information_schema.schemata where schema_name = 'crm';

-- 2) CRM triggers removed from public tables
select event_object_table, trigger_name
from information_schema.triggers
where event_object_schema = 'public'
  and trigger_name ilike 'crm_%';

-- 3) public.leads still present
select to_regclass('public.leads');
```

## Notes

- This reset is intentionally irreversible.
- CRM v2 scope/design is a separate follow-up phase.
