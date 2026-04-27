begin;

alter table public.leads
  add column if not exists country_code text,
  add column if not exists normalized_phone text,
  add column if not exists normalized_email text;

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
      and t.tgname = 'set_leads_updated_at'
      and not t.tgisinternal
  ) then
    execute 'alter table public.leads disable trigger set_leads_updated_at';
  end if;
end $$;

update public.leads
set country_code = '+91'
where country_code is null or btrim(country_code) = '';

alter table public.leads
  alter column country_code set default '+91',
  alter column country_code set not null;

create or replace function public.normalize_email(input text)
returns text
language sql
immutable
as $$
  select nullif(lower(btrim(coalesce(input, ''))), '');
$$;

create or replace function public.normalize_phone(input text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.set_lead_normalized_identity()
returns trigger
language plpgsql
as $$
begin
  new.country_code := coalesce(
    nullif('+' || regexp_replace(coalesce(new.country_code, ''), '[^0-9]', '', 'g'), '+'),
    '+91'
  );
  new.normalized_phone := public.normalize_phone(concat(new.country_code, coalesce(new.phone, '')));
  new.normalized_email := public.normalize_email(new.email);
  return new;
end;
$$;

drop trigger if exists set_leads_normalized_phone on public.leads;
drop trigger if exists set_leads_normalized_identity on public.leads;
create trigger set_leads_normalized_identity
before insert or update of phone, country_code, email
on public.leads
for each row
execute function public.set_lead_normalized_identity();

update public.leads
set
  country_code = coalesce(
    nullif('+' || regexp_replace(coalesce(country_code, ''), '[^0-9]', '', 'g'), '+'),
    '+91'
  ),
  normalized_phone = public.normalize_phone(
    concat(
      coalesce(
        nullif('+' || regexp_replace(coalesce(country_code, ''), '[^0-9]', '', 'g'), '+'),
        '+91'
      ),
      coalesce(phone, '')
    )
  ),
  normalized_email = public.normalize_email(email);

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'leads_active_normalized_phone_uidx'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'leads'
        and column_name = 'crm_status'
    ) then
      create unique index leads_active_normalized_phone_uidx
        on public.leads (normalized_phone)
        where normalized_phone is not null
          and btrim(normalized_phone) <> ''
          and coalesce(crm_status::text, '') <> 'archived';
    else
      create unique index leads_active_normalized_phone_uidx
        on public.leads (normalized_phone)
        where normalized_phone is not null
          and btrim(normalized_phone) <> ''
          and coalesce(status::text, '') <> 'archived';
    end if;
  end if;
exception
  when others then
    raise notice 'Skipped leads_active_normalized_phone_uidx creation: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'leads_active_normalized_email_uidx'
  ) then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'leads'
        and column_name = 'crm_status'
    ) then
      create unique index leads_active_normalized_email_uidx
        on public.leads (normalized_email)
        where normalized_email is not null
          and btrim(normalized_email) <> ''
          and coalesce(crm_status::text, '') <> 'archived';
    else
      create unique index leads_active_normalized_email_uidx
        on public.leads (normalized_email)
        where normalized_email is not null
          and btrim(normalized_email) <> ''
          and coalesce(status::text, '') <> 'archived';
    end if;
  end if;
exception
  when others then
    raise notice 'Skipped leads_active_normalized_email_uidx creation: %', sqlerrm;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'leads'
      and t.tgname = 'set_leads_updated_at'
      and not t.tgisinternal
  ) then
    execute 'alter table public.leads enable trigger set_leads_updated_at';
  end if;
end $$;

commit;
