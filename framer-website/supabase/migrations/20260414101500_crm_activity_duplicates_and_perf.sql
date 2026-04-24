-- CRM stabilization: activity logging, duplicate merge queue, and hot-path indexes.

-- ---------------------------------------------------------------------------
-- Lead activity timeline
-- ---------------------------------------------------------------------------
create table if not exists crm.lead_activity (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references crm.profiles(id) on delete set null,
  event_type text not null,
  field_name text,
  message text not null,
  before_value text,
  after_value text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_activity_lead_id_created_at_idx
  on crm.lead_activity (lead_id, created_at desc);

create index if not exists lead_activity_event_type_idx
  on crm.lead_activity (event_type);

alter table crm.lead_activity enable row level security;

drop policy if exists lead_activity_manager_all on crm.lead_activity;
create policy lead_activity_manager_all
on crm.lead_activity
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

drop policy if exists lead_activity_agent_read_own_leads on crm.lead_activity;
create policy lead_activity_agent_read_own_leads
on crm.lead_activity
for select
using (
  actor_id = auth.uid()
  or exists (
    select 1
    from public.leads l
    where l.id = lead_activity.lead_id
      and l.allotted_to = auth.uid()
  )
);

drop policy if exists lead_activity_agent_insert_own on crm.lead_activity;
create policy lead_activity_agent_insert_own
on crm.lead_activity
for insert
with check (actor_id = auth.uid());

grant select, insert, update, delete on crm.lead_activity to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Duplicate queue for manual merge workflow
-- ---------------------------------------------------------------------------
create table if not exists crm.lead_duplicates (
  id uuid primary key default gen_random_uuid(),
  primary_lead_id uuid not null references public.leads(id) on delete cascade,
  duplicate_lead_id uuid not null references public.leads(id) on delete cascade,
  match_reason text not null,
  confidence numeric(5,4) not null default 1,
  status text not null default 'pending' check (status in ('pending', 'merged', 'ignored')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references crm.profiles(id) on delete set null,
  notes text,
  constraint lead_duplicates_distinct_pair check (primary_lead_id <> duplicate_lead_id),
  constraint lead_duplicates_unique_pair unique (primary_lead_id, duplicate_lead_id)
);

create index if not exists lead_duplicates_status_created_at_idx
  on crm.lead_duplicates (status, created_at desc);

create index if not exists lead_duplicates_primary_idx on crm.lead_duplicates (primary_lead_id);
create index if not exists lead_duplicates_duplicate_idx on crm.lead_duplicates (duplicate_lead_id);

alter table crm.lead_duplicates enable row level security;

drop policy if exists lead_duplicates_manager_all on crm.lead_duplicates;
create policy lead_duplicates_manager_all
on crm.lead_duplicates
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

grant select, insert, update, delete on crm.lead_duplicates to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transactional merge path
-- ---------------------------------------------------------------------------
create or replace function crm.merge_duplicate_leads(
  p_queue_id uuid,
  p_survivor_lead_id uuid,
  p_duplicate_lead_id uuid,
  p_resolved_by uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, crm
as $$
declare
  queue_row crm.lead_duplicates%rowtype;
begin
  select *
  into queue_row
  from crm.lead_duplicates
  where id = p_queue_id
  for update;

  if queue_row.id is null then
    raise exception 'Duplicate queue item not found';
  end if;

  if queue_row.status <> 'pending' then
    raise exception 'Duplicate queue item already resolved';
  end if;

  if queue_row.primary_lead_id <> p_survivor_lead_id or queue_row.duplicate_lead_id <> p_duplicate_lead_id then
    raise exception 'Queue pair mismatch';
  end if;

  perform 1 from public.leads where id = p_survivor_lead_id for update;
  if not found then
    raise exception 'Survivor lead not found';
  end if;

  perform 1 from public.leads where id = p_duplicate_lead_id for update;
  if not found then
    raise exception 'Duplicate lead not found';
  end if;

  update lead_notes
  set lead_id = p_survivor_lead_id
  where lead_id = p_duplicate_lead_id;

  update crm.tasks
  set lead_id = p_survivor_lead_id
  where lead_id = p_duplicate_lead_id;

  update crm.lead_activity
  set lead_id = p_survivor_lead_id
  where lead_id = p_duplicate_lead_id;

  update public.leads
  set
    crm_status = 'archived',
    updated_at = now()
  where id = p_duplicate_lead_id;

  update crm.lead_duplicates
  set
    status = 'merged',
    resolved_at = now(),
    resolved_by = p_resolved_by,
    notes = p_notes
  where id = p_queue_id;

  insert into crm.lead_activity (
    lead_id,
    actor_id,
    event_type,
    message,
    metadata
  ) values (
    p_survivor_lead_id,
    p_resolved_by,
    'merge_completed',
    'Duplicate lead merged into survivor lead',
    jsonb_build_object(
      'queue_id', p_queue_id,
      'duplicate_lead_id', p_duplicate_lead_id,
      'notes', p_notes
    )
  );
end;
$$;

grant execute on function crm.merge_duplicate_leads(uuid, uuid, uuid, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hot-path performance indexes
-- ---------------------------------------------------------------------------
create index if not exists leads_crm_status_idx on public.leads (crm_status);
create index if not exists leads_next_follow_up_at_idx on public.leads (next_follow_up_at);
create index if not exists leads_allotted_status_followup_idx
  on public.leads (allotted_to, crm_status, next_follow_up_at);

create index if not exists crm_tasks_status_priority_due_idx
  on crm.tasks (status, priority, due_at);

create index if not exists crm_tasks_assigned_status_due_idx
  on crm.tasks (assigned_to, status, due_at);
