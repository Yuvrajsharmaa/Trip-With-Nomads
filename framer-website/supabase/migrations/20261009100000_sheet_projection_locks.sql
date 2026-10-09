create table if not exists public.sheet_projection_locks (
    lock_key text primary key,
    owner_token uuid not null,
    lease_until timestamptz not null,
    updated_at timestamptz not null default now()
);

alter table public.sheet_projection_locks enable row level security;
revoke all on table public.sheet_projection_locks from anon, authenticated;
grant all on table public.sheet_projection_locks to service_role;

create or replace function public.acquire_sheet_projection_lock(
    p_lock_key text,
    p_owner_token uuid,
    p_lease_seconds integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
    acquired boolean;
begin
    if nullif(trim(coalesce(p_lock_key, '')), '') is null or p_owner_token is null then
        raise exception 'Sheet projection lock key and owner are required';
    end if;

    insert into public.sheet_projection_locks (lock_key, owner_token, lease_until, updated_at)
    values (
        p_lock_key,
        p_owner_token,
        now() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 180), 30), 180)),
        now()
    )
    on conflict (lock_key) do update
    set owner_token = excluded.owner_token,
        lease_until = excluded.lease_until,
        updated_at = now()
    where public.sheet_projection_locks.lease_until <= now()
       or public.sheet_projection_locks.owner_token = excluded.owner_token
    returning true into acquired;

    return coalesce(acquired, false);
end;
$$;

create or replace function public.release_sheet_projection_lock(
    p_lock_key text,
    p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
    delete from public.sheet_projection_locks
    where lock_key = p_lock_key
      and owner_token = p_owner_token;
    return found;
end;
$$;

revoke all on function public.acquire_sheet_projection_lock(text, uuid, integer)
    from public, anon, authenticated;
revoke all on function public.release_sheet_projection_lock(text, uuid)
    from public, anon, authenticated;
grant execute on function public.acquire_sheet_projection_lock(text, uuid, integer)
    to service_role;
grant execute on function public.release_sheet_projection_lock(text, uuid)
    to service_role;
