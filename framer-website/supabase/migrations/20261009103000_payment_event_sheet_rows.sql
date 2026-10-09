create table if not exists public.payment_event_sheet_rows (
    payment_event_id uuid primary key
        references public.payment_events(id) on delete cascade,
    spreadsheet_id text not null,
    tab_name text not null,
    row_number integer not null check (row_number >= 2),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (spreadsheet_id, tab_name, row_number)
);

alter table public.payment_event_sheet_rows enable row level security;
revoke all on table public.payment_event_sheet_rows from public, anon, authenticated;
grant all on table public.payment_event_sheet_rows to service_role;
