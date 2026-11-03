begin;

alter table public.payment_attempts
    add column if not exists superseded_payment_ids text[] not null default '{}';

commit;
