-- CRM Team Hub foundation:
-- 1) notifications for escalation/approval signals
-- 2) goal-setting table for manager dashboards

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists crm.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references crm.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'info' check (type in ('info', 'success', 'warning', 'error')),
  link text,
  send_email boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on crm.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on crm.notifications (user_id, read_at)
  where read_at is null;

alter table crm.notifications enable row level security;

drop policy if exists notifications_select_own on crm.notifications;
create policy notifications_select_own
on crm.notifications
for select
using (user_id = auth.uid());

drop policy if exists notifications_update_own on crm.notifications;
create policy notifications_update_own
on crm.notifications
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists notifications_insert_authenticated on crm.notifications;
create policy notifications_insert_authenticated
on crm.notifications
for insert
with check (
  exists (
    select 1
    from crm.profiles p
    where p.id = auth.uid()
      and p.status in ('active', 'pending')
  )
);

drop policy if exists notifications_manager_delete on crm.notifications;
create policy notifications_manager_delete
on crm.notifications
for delete
using (
  exists (
    select 1
    from crm.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
  )
);

grant select, insert, update, delete on crm.notifications to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Team goals (manager-configurable targets)
-- ---------------------------------------------------------------------------
create table if not exists crm.team_goals (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references crm.teams(id) on delete cascade,
  owner_scope text not null check (owner_scope in ('team', 'agent')),
  owner_id uuid references crm.profiles(id) on delete cascade,
  metric_key text not null check (metric_key in (
    'closed_won',
    'closed_dropped',
    'active_leads',
    'overdue_followups',
    'tasks_done',
    'attendance_hours'
  )),
  period text not null check (period in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom')),
  starts_on date not null,
  ends_on date,
  target_value numeric(12,2) not null check (target_value >= 0),
  is_active boolean not null default true,
  created_by uuid references crm.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_goals_scope_check check (
    (owner_scope = 'team' and team_id is not null and owner_id is null) or
    (owner_scope = 'agent' and owner_id is not null)
  )
);

create index if not exists team_goals_scope_period_idx
  on crm.team_goals (owner_scope, period, starts_on desc);

create index if not exists team_goals_team_idx on crm.team_goals (team_id);
create index if not exists team_goals_owner_idx on crm.team_goals (owner_id);

create or replace function crm.set_team_goals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_team_goals_updated_at on crm.team_goals;
create trigger trg_team_goals_updated_at
before update on crm.team_goals
for each row execute function crm.set_team_goals_updated_at();

alter table crm.team_goals enable row level security;

drop policy if exists team_goals_manager_all on crm.team_goals;
create policy team_goals_manager_all
on crm.team_goals
for all
using (
  exists (
    select 1
    from crm.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
  )
)
with check (
  exists (
    select 1
    from crm.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
  )
);

drop policy if exists team_goals_agent_read_own on crm.team_goals;
create policy team_goals_agent_read_own
on crm.team_goals
for select
using (owner_id = auth.uid());

grant select, insert, update, delete on crm.team_goals to authenticated, service_role;
