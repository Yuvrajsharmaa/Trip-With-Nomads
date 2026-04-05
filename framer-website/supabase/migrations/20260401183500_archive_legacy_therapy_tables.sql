-- Move non-Nomads legacy tables out of public schema.
-- This is a reversible, non-destructive cleanup step:
-- data is retained under legacy_archive.* and can be restored if needed.

begin;

create schema if not exists legacy_archive;

create table if not exists legacy_archive.archived_tables_log (
    id bigserial primary key,
    archived_at timestamptz not null default now(),
    source_schema text not null,
    source_table text not null,
    destination_schema text not null,
    moved boolean not null,
    notes text
);

do $$
declare
    tbl text;
    dep record;
    legacy_tables text[] := array[
        'availability_slots',
        'client_metrics',
        'conversations',
        'crisis_flags',
        'messages',
        'profiles',
        'sessions',
        'therapists',
        'user_preferences'
    ];
    nomads_tables text[] := array[
        'trips',
        'trip_pricing',
        'bookings',
        'coupons',
        'leads',
        'payment_attempts'
    ];
begin
    -- Legacy bookings FKs from pre-Nomads schema; current Trip checkout
    -- flow does not read/write these columns.
    if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = 'bookings'
    ) then
        execute 'alter table public.bookings drop constraint if exists bookings_slot_id_fkey';
        execute 'alter table public.bookings drop constraint if exists bookings_therapist_id_fkey';
        execute 'alter table public.bookings drop constraint if exists bookings_user_id_fkey';
    end if;

    -- Safety gate: abort if core Nomads tables have direct FK dependency
    -- to any table we are about to move.
    for dep in
        select
            con.conname as fk_name,
            src.relname as source_table,
            tgt.relname as target_table
        from pg_constraint con
        join pg_class src on src.oid = con.conrelid
        join pg_namespace src_ns on src_ns.oid = src.relnamespace
        join pg_class tgt on tgt.oid = con.confrelid
        join pg_namespace tgt_ns on tgt_ns.oid = tgt.relnamespace
        where con.contype = 'f'
          and src_ns.nspname = 'public'
          and tgt_ns.nspname = 'public'
          and src.relname = any(nomads_tables)
          and tgt.relname = any(legacy_tables)
    loop
        raise exception
            'Cleanup aborted: FK % on public.% depends on public.%',
            dep.fk_name, dep.source_table, dep.target_table;
    end loop;

    foreach tbl in array legacy_tables
    loop
        if exists (
            select 1
            from information_schema.tables
            where table_schema = 'public'
              and table_name = tbl
        ) then
            execute format('alter table public.%I set schema legacy_archive', tbl);
            insert into legacy_archive.archived_tables_log (
                source_schema,
                source_table,
                destination_schema,
                moved,
                notes
            ) values (
                'public',
                tbl,
                'legacy_archive',
                true,
                'Moved by 20260401183500_archive_legacy_therapy_tables'
            );
        else
            insert into legacy_archive.archived_tables_log (
                source_schema,
                source_table,
                destination_schema,
                moved,
                notes
            ) values (
                'public',
                tbl,
                'legacy_archive',
                false,
                'Table not found in public'
            );
        end if;
    end loop;
end $$;

commit;
