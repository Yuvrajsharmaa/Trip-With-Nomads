-- Create the tasks table in the crm schema
CREATE TABLE IF NOT EXISTS crm.tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  description TEXT,
  priority    crm.task_priority NOT NULL DEFAULT 'medium',
  status      crm.task_status NOT NULL DEFAULT 'todo',
  due_at      TIMESTAMPTZ,
  lead_id     UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES crm.profiles(id) ON DELETE SET NULL,
  created_by  UUID NOT NULL REFERENCES crm.profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION crm.tasks_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_updated_at ON crm.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON crm.tasks
  FOR EACH ROW EXECUTE FUNCTION crm.tasks_set_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS tasks_assigned_to_idx ON crm.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS tasks_lead_id_idx      ON crm.tasks (lead_id);
CREATE INDEX IF NOT EXISTS tasks_status_idx       ON crm.tasks (status);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx       ON crm.tasks (due_at);

-- RLS
ALTER TABLE crm.tasks ENABLE ROW LEVEL SECURITY;

-- Managers see all tasks
CREATE POLICY tasks_manager_all ON crm.tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM crm.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('admin','operations_manager','sales_manager','finance_manager')
    )
  );

-- Agents see tasks they created or are assigned to
CREATE POLICY tasks_agent_own ON crm.tasks
  FOR ALL
  USING (
    created_by = auth.uid() OR assigned_to = auth.uid()
  );

-- Grant API role access (required for PostgREST schema cache)
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.tasks TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.task_priority TO anon, authenticated, service_role;
GRANT USAGE ON TYPE crm.task_status   TO anon, authenticated, service_role;
