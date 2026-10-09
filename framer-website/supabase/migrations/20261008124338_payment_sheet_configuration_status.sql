begin;

-- A payment event that needs a Sheet projection must never be silently marked
-- "not_required" because a deployment is missing its Sheet configuration.
alter table if exists public.payment_events
    drop constraint if exists payment_events_sheet_sync_status_check;

alter table if exists public.payment_events
    add constraint payment_events_sheet_sync_status_check
    check (sheet_sync_status in ('not_required', 'pending', 'synced', 'failed', 'configuration_missing'));

commit;
