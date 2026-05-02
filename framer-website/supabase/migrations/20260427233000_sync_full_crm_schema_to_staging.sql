begin;

create extension if not exists pgcrypto;
create schema if not exists crm;

-- CRM enums
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm' AND t.typname = 'handoff_status'
  ) THEN
    CREATE TYPE crm.handoff_status AS ENUM (
      'pending_verification',
      'assigned',
      'verified',
      'payment_confirmed',
      'flagged'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm' AND t.typname = 'lead_status'
  ) THEN
    CREATE TYPE crm.lead_status AS ENUM (
      'new',
      'claimed',
      'follow_up_1',
      'follow_up_2',
      'follow_up_3',
      'follow_up_4',
      'final_call',
      'won',
      'dropped',
      'handed_off',
      'archived'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm' AND t.typname = 'profile_status'
  ) THEN
    CREATE TYPE crm.profile_status AS ENUM ('pending', 'active', 'suspended');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm' AND t.typname = 'trip_type'
  ) THEN
    CREATE TYPE crm.trip_type AS ENUM ('group', 'customised');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'crm' AND t.typname = 'user_role'
  ) THEN
    CREATE TYPE crm.user_role AS ENUM (
      'admin',
      'operations_manager',
      'sales_manager',
      'sales_agent',
      'finance_manager',
      'finance_agent'
    );
  END IF;
END$$;

-- Leads table: ensure CRM columns exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS crm_status crm.lead_status DEFAULT 'new'::crm.lead_status,
  ADD COLUMN IF NOT EXISTS allotted_to uuid,
  ADD COLUMN IF NOT EXISTS team_id uuid,
  ADD COLUMN IF NOT EXISTS lead_type text,
  ADD COLUMN IF NOT EXISTS last_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drop_reason text,
  ADD COLUMN IF NOT EXISTS dropped_at timestamptz,
  ADD COLUMN IF NOT EXISTS won_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_to uuid,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS country_code text DEFAULT '+91',
  ADD COLUMN IF NOT EXISTS normalized_email text;

UPDATE public.leads SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.leads SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE public.leads SET follow_up_count = 0 WHERE follow_up_count IS NULL;
UPDATE public.leads SET country_code = '+91' WHERE country_code IS NULL OR btrim(country_code) = '';

ALTER TABLE public.leads
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN follow_up_count SET DEFAULT 0,
  ALTER COLUMN country_code SET DEFAULT '+91',
  ALTER COLUMN country_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_allotted_to_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_allotted_to_fkey
      FOREIGN KEY (allotted_to) REFERENCES auth.users(id);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_escalated_to_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_escalated_to_fkey
      FOREIGN KEY (escalated_to) REFERENCES auth.users(id);
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(input, ''), '[^0-9]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_leads_updated_at ON public.leads;
CREATE TRIGGER set_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  note_type text NOT NULL,
  content text NOT NULL,
  logged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_notes_note_type_check CHECK (
    note_type = ANY (
      ARRAY[
        'follow_up_1'::text,
        'follow_up_2'::text,
        'follow_up_3'::text,
        'follow_up_4'::text,
        'follow_up_5'::text,
        'general_note'::text,
        'escalation_note'::text
      ]
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_notes_lead_id_fkey'
  ) THEN
    ALTER TABLE public.lead_notes
      ADD CONSTRAINT lead_notes_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lead_notes_agent_id_fkey'
  ) THEN
    ALTER TABLE public.lead_notes
      ADD CONSTRAINT lead_notes_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON public.lead_notes (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_agent_id ON public.lead_notes (agent_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_logged_at ON public.lead_notes (logged_at DESC);

-- CRM tables
CREATE TABLE IF NOT EXISTS crm.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  manager_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT teams_name_key UNIQUE (name),
  CONSTRAINT teams_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS crm.profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text,
  role crm.user_role NOT NULL DEFAULT 'sales_agent'::crm.user_role,
  team_id uuid,
  status crm.profile_status NOT NULL DEFAULT 'pending'::crm.profile_status,
  avatar_url text,
  last_active_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_team_id_fkey FOREIGN KEY (team_id) REFERENCES crm.teams(id)
);

CREATE TABLE IF NOT EXISTS crm.lead_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  actor_id uuid,
  event_type text NOT NULL,
  field_name text,
  message text NOT NULL,
  before_value text,
  after_value text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_activity_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
  CONSTRAINT lead_activity_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES crm.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS crm.lead_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_lead_id uuid NOT NULL,
  duplicate_lead_id uuid NOT NULL,
  match_reason text NOT NULL,
  confidence numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  CONSTRAINT lead_duplicates_primary_lead_id_fkey FOREIGN KEY (primary_lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
  CONSTRAINT lead_duplicates_duplicate_lead_id_fkey FOREIGN KEY (duplicate_lead_id) REFERENCES public.leads(id) ON DELETE CASCADE,
  CONSTRAINT lead_duplicates_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES crm.profiles(id) ON DELETE SET NULL,
  CONSTRAINT lead_duplicates_unique_pair UNIQUE (primary_lead_id, duplicate_lead_id),
  CONSTRAINT lead_duplicates_distinct_pair CHECK (primary_lead_id <> duplicate_lead_id),
  CONSTRAINT lead_duplicates_status_check CHECK (status = ANY (ARRAY['pending'::text, 'merged'::text, 'ignored'::text]))
);

CREATE TABLE IF NOT EXISTS crm.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'medium'::text,
  status text NOT NULL DEFAULT 'todo'::text,
  due_at timestamptz,
  lead_id uuid,
  assigned_to uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_priority_check CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])),
  CONSTRAINT tasks_status_check CHECK (status = ANY (ARRAY['todo'::text, 'in_progress'::text, 'done'::text])),
  CONSTRAINT tasks_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL,
  CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES crm.profiles(id) ON DELETE SET NULL,
  CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES crm.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'info'::text,
  link text,
  send_email boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text])),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES crm.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm.team_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid,
  owner_scope text NOT NULL,
  owner_id uuid,
  metric_key text NOT NULL,
  period text NOT NULL,
  starts_on date NOT NULL,
  ends_on date,
  target_value numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_goals_owner_scope_check CHECK (owner_scope = ANY (ARRAY['team'::text, 'agent'::text])),
  CONSTRAINT team_goals_metric_key_check CHECK (metric_key = ANY (ARRAY['closed_won'::text, 'closed_dropped'::text, 'active_leads'::text, 'overdue_followups'::text, 'tasks_done'::text, 'attendance_hours'::text])),
  CONSTRAINT team_goals_period_check CHECK (period = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text, 'quarterly'::text, 'yearly'::text, 'custom'::text])),
  CONSTRAINT team_goals_target_value_check CHECK (target_value >= 0),
  CONSTRAINT team_goals_scope_check CHECK (
    ((owner_scope = 'team'::text) AND (team_id IS NOT NULL) AND (owner_id IS NULL))
    OR ((owner_scope = 'agent'::text) AND (owner_id IS NOT NULL))
  ),
  CONSTRAINT team_goals_team_id_fkey FOREIGN KEY (team_id) REFERENCES crm.teams(id) ON DELETE CASCADE,
  CONSTRAINT team_goals_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES crm.profiles(id) ON DELETE CASCADE,
  CONSTRAINT team_goals_created_by_fkey FOREIGN KEY (created_by) REFERENCES crm.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS crm.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL,
  team_id uuid,
  invited_by uuid NOT NULL,
  token_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_by uuid,
  accepted_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT team_invitations_token_hash_key UNIQUE (token_hash),
  CONSTRAINT team_invitations_role_check CHECK (role = ANY (ARRAY['admin'::text, 'operations_manager'::text, 'sales_manager'::text, 'sales_agent'::text, 'finance_manager'::text, 'finance_agent'::text])),
  CONSTRAINT team_invitations_status_check CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'revoked'::text, 'expired'::text])),
  CONSTRAINT team_invitations_team_id_fkey FOREIGN KEY (team_id) REFERENCES crm.teams(id) ON DELETE SET NULL,
  CONSTRAINT team_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES crm.profiles(id) ON DELETE CASCADE,
  CONSTRAINT team_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES crm.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS crm.weekly_off_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_week_start date NOT NULL,
  requested_day_of_week integer NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text,
  approved_day_of_week integer,
  reviewer_id uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_off_requests_requested_day_of_week_check CHECK ((requested_day_of_week >= 0) AND (requested_day_of_week <= 6)),
  CONSTRAINT weekly_off_requests_approved_day_of_week_check CHECK ((approved_day_of_week >= 0) AND (approved_day_of_week <= 6)),
  CONSTRAINT weekly_off_requests_status_check CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  CONSTRAINT weekly_off_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT weekly_off_requests_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id)
);

-- CRM functions
CREATE OR REPLACE FUNCTION crm.tasks_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION crm.set_team_goals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION crm.set_team_invitations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION crm.is_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM crm.profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND role IN ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
  );
$$;

CREATE OR REPLACE FUNCTION crm.get_my_role()
RETURNS crm.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM crm.profiles
  WHERE id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION crm.resolve_team_invitation(raw_token text)
RETURNS TABLE(invitation_id uuid, email text, role text, team_id uuid, status text, expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $$
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

CREATE OR REPLACE FUNCTION crm.accept_team_invitation(raw_token text)
RETURNS TABLE(invitation_id uuid, role text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $$
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

CREATE OR REPLACE FUNCTION crm.set_my_debug_role(next_role text)
RETURNS TABLE(id uuid, role text, full_name text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'crm', 'public', 'auth'
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_email text;
  target_role text;
  can_debug boolean := false;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  target_role := lower(trim(next_role));
  IF target_role NOT IN (
    'admin',
    'operations_manager',
    'sales_manager',
    'sales_agent',
    'finance_manager',
    'finance_agent'
  ) THEN
    RAISE EXCEPTION 'Invalid role: %', next_role;
  END IF;

  SELECT u.email
  INTO caller_email
  FROM auth.users AS u
  WHERE u.id = caller_id;

  can_debug := EXISTS (
      SELECT 1
      FROM crm.profiles p
      WHERE p.id = caller_id
        AND p.status = 'active'
        AND p.role = 'admin'
    )
    OR lower(coalesce(caller_email, '')) IN (
      'yuvrajsharma6367@gmail.com'
    );

  IF NOT can_debug THEN
    RAISE EXCEPTION 'Not allowed to switch role';
  END IF;

  RETURN QUERY
  UPDATE crm.profiles p
  SET role = target_role::crm.user_role,
      updated_at = now()
  WHERE p.id = caller_id
    AND p.status = 'active'
  RETURNING p.id, p.role::text, p.full_name, p.status::text;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active profile not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION crm.merge_duplicate_leads(
  p_queue_id uuid,
  p_survivor_lead_id uuid,
  p_duplicate_lead_id uuid,
  p_resolved_by uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'crm'
AS $$
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

  update public.lead_notes
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

-- Triggers
DROP TRIGGER IF EXISTS tasks_updated_at ON crm.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON crm.tasks
  FOR EACH ROW EXECUTE FUNCTION crm.tasks_set_updated_at();

DROP TRIGGER IF EXISTS trg_team_goals_updated_at ON crm.team_goals;
CREATE TRIGGER trg_team_goals_updated_at
  BEFORE UPDATE ON crm.team_goals
  FOR EACH ROW EXECUTE FUNCTION crm.set_team_goals_updated_at();

DROP TRIGGER IF EXISTS trg_team_invitations_updated_at ON crm.team_invitations;
CREATE TRIGGER trg_team_invitations_updated_at
  BEFORE UPDATE ON crm.team_invitations
  FOR EACH ROW EXECUTE FUNCTION crm.set_team_invitations_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS lead_activity_lead_id_created_at_idx ON crm.lead_activity (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_activity_event_type_idx ON crm.lead_activity (event_type);

CREATE INDEX IF NOT EXISTS lead_duplicates_primary_idx ON crm.lead_duplicates (primary_lead_id);
CREATE INDEX IF NOT EXISTS lead_duplicates_duplicate_idx ON crm.lead_duplicates (duplicate_lead_id);
CREATE INDEX IF NOT EXISTS lead_duplicates_status_created_at_idx ON crm.lead_duplicates (status, created_at DESC);

CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON crm.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS tasks_lead_id_idx ON crm.tasks (lead_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON crm.tasks (status);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON crm.tasks (due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_status_priority_due_idx ON crm.tasks (status, priority, due_at);
CREATE INDEX IF NOT EXISTS crm_tasks_assigned_status_due_idx ON crm.tasks (assigned_to, status, due_at);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON crm.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON crm.notifications (user_id, read_at) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS team_goals_team_idx ON crm.team_goals (team_id);
CREATE INDEX IF NOT EXISTS team_goals_owner_idx ON crm.team_goals (owner_id);
CREATE INDEX IF NOT EXISTS team_goals_scope_period_idx ON crm.team_goals (owner_scope, period, starts_on DESC);

CREATE INDEX IF NOT EXISTS team_invitations_email_status_idx ON crm.team_invitations (email, status);
CREATE INDEX IF NOT EXISTS team_invitations_status_created_idx ON crm.team_invitations (status, created_at DESC);
CREATE INDEX IF NOT EXISTS team_invitations_expires_idx ON crm.team_invitations (expires_at) WHERE status = 'pending'::text;

CREATE INDEX IF NOT EXISTS idx_weekly_off_requests_user_week ON crm.weekly_off_requests (user_id, requested_week_start DESC);

CREATE INDEX IF NOT EXISTS leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_email_idx ON public.leads (lower(email));
CREATE INDEX IF NOT EXISTS leads_source_idx ON public.leads (source);
CREATE INDEX IF NOT EXISTS leads_status_idx ON public.leads (status);
CREATE INDEX IF NOT EXISTS leads_trip_slug_idx ON public.leads (trip_slug);

-- RLS and policies
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.lead_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.team_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.weekly_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE crm.teams DISABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_insert_open') THEN
    CREATE POLICY leads_insert_open ON public.leads FOR INSERT WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_select_crm_users') THEN
    CREATE POLICY leads_select_crm_users ON public.leads
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM crm.profiles
          WHERE profiles.id = auth.uid()
            AND profiles.status = 'active'::crm.profile_status
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='leads' AND policyname='leads_update_allotted_agent') THEN
    CREATE POLICY leads_update_allotted_agent ON public.leads
      FOR UPDATE
      USING (crm.is_manager_or_admin() OR auth.uid() = allotted_to OR allotted_to IS NULL)
      WITH CHECK (crm.is_manager_or_admin() OR auth.uid() = allotted_to);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_notes' AND policyname='lead_notes_select_active') THEN
    CREATE POLICY lead_notes_select_active ON public.lead_notes
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'::crm.profile_status
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_notes' AND policyname='lead_notes_insert_own') THEN
    CREATE POLICY lead_notes_insert_own ON public.lead_notes
      FOR INSERT WITH CHECK (
        auth.uid() = agent_id
        AND EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'::crm.profile_status
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='lead_notes' AND policyname='lead_notes_update_own_or_manager') THEN
    CREATE POLICY lead_notes_update_own_or_manager ON public.lead_notes
      FOR UPDATE USING (auth.uid() = agent_id OR crm.is_manager_or_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='lead_activity' AND policyname='lead_activity_manager_all') THEN
    CREATE POLICY lead_activity_manager_all ON crm.lead_activity
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='lead_activity' AND policyname='lead_activity_agent_read_own_leads') THEN
    CREATE POLICY lead_activity_agent_read_own_leads ON crm.lead_activity
      FOR SELECT USING (
        actor_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = lead_activity.lead_id
            AND l.allotted_to = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='lead_activity' AND policyname='lead_activity_agent_insert_own') THEN
    CREATE POLICY lead_activity_agent_insert_own ON crm.lead_activity
      FOR INSERT WITH CHECK (actor_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='lead_duplicates' AND policyname='lead_duplicates_manager_all') THEN
    CREATE POLICY lead_duplicates_manager_all ON crm.lead_duplicates
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='tasks' AND policyname='tasks_manager_all') THEN
    CREATE POLICY tasks_manager_all ON crm.tasks
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='tasks' AND policyname='tasks_agent_own') THEN
    CREATE POLICY tasks_agent_own ON crm.tasks
      FOR ALL USING (created_by = auth.uid() OR assigned_to = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='notifications' AND policyname='notifications_select_own') THEN
    CREATE POLICY notifications_select_own ON crm.notifications
      FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='notifications' AND policyname='notifications_update_own') THEN
    CREATE POLICY notifications_update_own ON crm.notifications
      FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='notifications' AND policyname='notifications_insert_authenticated') THEN
    CREATE POLICY notifications_insert_authenticated ON crm.notifications
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.status = ANY (ARRAY['active'::crm.profile_status, 'pending'::crm.profile_status])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='notifications' AND policyname='notifications_manager_delete') THEN
    CREATE POLICY notifications_manager_delete ON crm.notifications
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='team_goals' AND policyname='team_goals_manager_all') THEN
    CREATE POLICY team_goals_manager_all ON crm.team_goals
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='team_goals' AND policyname='team_goals_agent_read_own') THEN
    CREATE POLICY team_goals_agent_read_own ON crm.team_goals
      FOR SELECT USING (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='team_invitations' AND policyname='team_invitations_manager_all') THEN
    CREATE POLICY team_invitations_manager_all ON crm.team_invitations
      AS PERMISSIVE
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'::crm.profile_status
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'::crm.profile_status
            AND p.role = ANY (ARRAY['admin'::crm.user_role, 'operations_manager'::crm.user_role, 'sales_manager'::crm.user_role, 'finance_manager'::crm.user_role])
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='weekly_off_requests' AND policyname='weekly_off_insert_own') THEN
    CREATE POLICY weekly_off_insert_own ON crm.weekly_off_requests
      FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
          SELECT 1 FROM crm.profiles p
          WHERE p.id = auth.uid()
            AND p.status = 'active'::crm.profile_status
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='weekly_off_requests' AND policyname='weekly_off_select_own_or_manager') THEN
    CREATE POLICY weekly_off_select_own_or_manager ON crm.weekly_off_requests
      FOR SELECT USING (auth.uid() = user_id OR crm.is_manager_or_admin());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='crm' AND tablename='weekly_off_requests' AND policyname='weekly_off_update_manager_only') THEN
    CREATE POLICY weekly_off_update_manager_only ON crm.weekly_off_requests
      FOR UPDATE USING (crm.is_manager_or_admin());
  END IF;
END $$;

-- Grants
GRANT USAGE ON SCHEMA crm TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.handoff_status TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.lead_status TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.profile_status TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.trip_type TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.user_role TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON crm.lead_activity TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.lead_duplicates TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.notifications TO authenticated, service_role;
GRANT ALL PRIVILEGES ON crm.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.tasks TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.team_goals TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.team_invitations TO authenticated, service_role;
GRANT SELECT ON crm.teams TO anon;
GRANT ALL PRIVILEGES ON crm.teams TO authenticated;
GRANT INSERT, SELECT, UPDATE ON crm.weekly_off_requests TO authenticated;

GRANT ALL PRIVILEGES ON public.leads TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON public.lead_notes TO anon, authenticated, service_role;

commit;
