-- CRM team invitations lifecycle with token acceptance tracking

create table if not exists crm.team_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (
    role in (
      'admin',
      'operations_manager',
      'sales_manager',
      'sales_agent',
      'finance_manager',
      'finance_agent'
    )
  ),
  team_id uuid null references crm.teams(id) on delete set null,
  invited_by uuid not null references crm.profiles(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  sent_at timestamptz null,
  accepted_by uuid null references crm.profiles(id) on delete set null,
  accepted_at timestamptz null,
  revoked_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists team_invitations_status_created_idx
  on crm.team_invitations (status, created_at desc);
create index if not exists team_invitations_email_status_idx
  on crm.team_invitations (email, status);
create index if not exists team_invitations_expires_idx
  on crm.team_invitations (expires_at)
  where status = 'pending';

create or replace function crm.set_team_invitations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_team_invitations_updated_at on crm.team_invitations;
create trigger trg_team_invitations_updated_at
before update on crm.team_invitations
for each row execute function crm.set_team_invitations_updated_at();

alter table crm.team_invitations enable row level security;

drop policy if exists team_invitations_manager_all on crm.team_invitations;
create policy team_invitations_manager_all
on crm.team_invitations
for all
to authenticated
using (
  exists (
    select 1
    from crm.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
  )
)
with check (
  exists (
    select 1
    from crm.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
  )
);

grant select, insert, update, delete on crm.team_invitations to authenticated, service_role;

create or replace function crm.resolve_team_invitation(raw_token text)
returns table (
  invitation_id uuid,
  email text,
  role text,
  team_id uuid,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public, crm
as $$
declare
  token_value text := trim(coalesce(raw_token, ''));
  token_digest text;
  row_data crm.team_invitations%rowtype;
begin
  if token_value = '' then
    return;
  end if;

  token_digest := encode(digest(token_value, 'sha256'), 'hex');

  select *
  into row_data
  from crm.team_invitations
  where token_hash = token_digest
  limit 1;

  if not found then
    return;
  end if;

  if row_data.status = 'pending' and row_data.expires_at < timezone('utc', now()) then
    update crm.team_invitations
    set status = 'expired',
        updated_at = timezone('utc', now())
    where id = row_data.id;

    row_data.status := 'expired';
  end if;

  invitation_id := row_data.id;
  email := row_data.email;
  role := row_data.role;
  team_id := row_data.team_id;
  status := row_data.status;
  expires_at := row_data.expires_at;

  return next;
end;
$$;

grant execute on function crm.resolve_team_invitation(text) to anon, authenticated, service_role;

create or replace function crm.accept_team_invitation(raw_token text)
returns table (
  invitation_id uuid,
  role text,
  team_id uuid
)
language plpgsql
security definer
set search_path = public, crm
as $$
declare
  token_value text := trim(coalesce(raw_token, ''));
  token_digest text;
  row_data crm.team_invitations%rowtype;
  caller_id uuid := auth.uid();
  caller_email text;
begin
  if caller_id is null then
    raise exception 'Unauthorized';
  end if;

  if token_value = '' then
    raise exception 'Missing invitation token';
  end if;

  token_digest := encode(digest(token_value, 'sha256'), 'hex');

  select email
  into caller_email
  from auth.users
  where id = caller_id;

  if caller_email is null then
    raise exception 'Unable to resolve user email';
  end if;

  select *
  into row_data
  from crm.team_invitations
  where token_hash = token_digest
  for update;

  if not found then
    raise exception 'Invitation not found';
  end if;

  if row_data.status <> 'pending' then
    raise exception 'Invitation is no longer pending';
  end if;

  if row_data.expires_at < timezone('utc', now()) then
    update crm.team_invitations
    set status = 'expired',
        updated_at = timezone('utc', now())
    where id = row_data.id;
    raise exception 'Invitation has expired';
  end if;

  if lower(caller_email) <> lower(row_data.email) then
    raise exception 'Invitation email mismatch';
  end if;

  update crm.team_invitations
  set status = 'accepted',
      accepted_by = caller_id,
      accepted_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = row_data.id;

  update crm.profiles
  set role = row_data.role,
      team_id = row_data.team_id,
      updated_at = timezone('utc', now())
  where id = caller_id;

  invitation_id := row_data.id;
  role := row_data.role;
  team_id := row_data.team_id;

  return next;
end;
$$;

grant execute on function crm.accept_team_invitation(text) to authenticated, service_role;
