CREATE TABLE IF NOT EXISTS crm.attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES crm.profiles(id) ON DELETE CASCADE,
    work_date DATE NOT NULL,
    location_type TEXT NOT NULL CHECK (location_type IN ('WFO', 'WFH')),
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    breaks JSONB DEFAULT '[]'::jsonb,
    total_hours NUMERIC DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'leave_requested', 'leave_approved', 'absent')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, work_date)
);

CREATE TABLE IF NOT EXISTS crm.time_off_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES crm.profiles(id) ON DELETE CASCADE,
    requested_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    manager_id UUID REFERENCES crm.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agent_id, requested_date)
);

-- RLS for attendance_logs
ALTER TABLE crm.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attendance"
    ON crm.attendance_logs FOR SELECT
    USING (auth.uid() = agent_id);

CREATE POLICY "Managers can view all attendance"
    ON crm.attendance_logs FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM crm.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
    ));

CREATE POLICY "Users can insert their own attendance"
    ON crm.attendance_logs FOR INSERT
    WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Users can update their own attendance"
    ON crm.attendance_logs FOR UPDATE
    USING (auth.uid() = agent_id);

CREATE POLICY "Managers can update any attendance"
    ON crm.attendance_logs FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM crm.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
    ));

-- RLS for time_off_requests
ALTER TABLE crm.time_off_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own time off"
    ON crm.time_off_requests FOR SELECT
    USING (auth.uid() = agent_id);

CREATE POLICY "Managers can view all time off"
    ON crm.time_off_requests FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM crm.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
    ));

CREATE POLICY "Users can insert their own time off"
    ON crm.time_off_requests FOR INSERT
    WITH CHECK (auth.uid() = agent_id);

CREATE POLICY "Managers can update time off"
    ON crm.time_off_requests FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM crm.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'operations_manager', 'sales_manager', 'finance_manager')
    ));
