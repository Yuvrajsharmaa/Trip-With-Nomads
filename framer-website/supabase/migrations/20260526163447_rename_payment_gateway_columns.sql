-- Rename PayU-specific columns to gateway-agnostic names used by dual gateway flow.
-- Safe for repeated execution and mixed states.

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payu_txnid'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payment_gateway_txn_id'
    ) then
        execute 'alter table public.bookings rename column payu_txnid to payment_gateway_txn_id';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payu_mihpayid'
    ) and not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payment_gateway_order_or_ref_id'
    ) then
        execute 'alter table public.bookings rename column payu_mihpayid to payment_gateway_order_or_ref_id';
    end if;
end $$;

alter table if exists public.bookings
    add column if not exists payment_gateway_txn_id text,
    add column if not exists payment_gateway_order_or_ref_id text;

do $$
begin
    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payu_txnid'
    ) and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payment_gateway_txn_id'
    ) then
        execute '
            update public.bookings
               set payment_gateway_txn_id = coalesce(payment_gateway_txn_id, payu_txnid)
             where payment_gateway_txn_id is null and payu_txnid is not null
        ';
        execute 'alter table public.bookings drop column payu_txnid';
    end if;

    if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payu_mihpayid'
    ) and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bookings'
          and column_name = 'payment_gateway_order_or_ref_id'
    ) then
        execute '
            update public.bookings
               set payment_gateway_order_or_ref_id = coalesce(payment_gateway_order_or_ref_id, payu_mihpayid)
             where payment_gateway_order_or_ref_id is null and payu_mihpayid is not null
        ';
        execute 'alter table public.bookings drop column payu_mihpayid';
    end if;
end $$;

drop index if exists public.bookings_payu_txnid_idx;
drop index if exists public.bookings_payu_mihpayid_idx;
drop index if exists public.idx_bookings_payu_txnid;
create index if not exists bookings_payment_gateway_txn_id_idx on public.bookings(payment_gateway_txn_id);
create index if not exists bookings_payment_gateway_order_or_ref_id_idx on public.bookings(payment_gateway_order_or_ref_id);
