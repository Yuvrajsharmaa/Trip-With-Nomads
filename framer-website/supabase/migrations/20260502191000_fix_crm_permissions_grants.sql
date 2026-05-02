-- Fix missing grants for CRM schema tables (specifically attendance_logs and time_off_requests)
-- This ensures the authenticated role can access these tables via the CRM dashboard.

GRANT USAGE ON SCHEMA crm TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA crm TO authenticated, anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA crm TO authenticated, anon, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA crm TO authenticated, anon, service_role;

-- Ensure future tables also get these grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT ALL ON TABLES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA crm GRANT ALL ON FUNCTIONS TO authenticated, anon, service_role;
