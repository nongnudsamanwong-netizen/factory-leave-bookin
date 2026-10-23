-- =====================================================================
-- Create (or promote) the FIRST administrator.
-- Run once in the Supabase SQL Editor AFTER 001_schema.sql.
-- Replace the values marked  <<< CHANGE ME  before running.
-- After this, further admins can be managed from the Admin dashboard.
-- =====================================================================
insert into public.employees (employee_id, full_name, department, shift, role, is_active)
values ('ADMIN01',             -- <<< CHANGE ME: admin Employee ID
        'ผู้ดูแลระบบ',           -- <<< CHANGE ME: full name
        'HR',                  -- <<< CHANGE ME: department
        'A', 'admin', true)
on conflict ((upper(employee_id))) do update set role = 'admin', is_active = true, updated_at = now();

update public.employees
   set admin_pin_hash = extensions.crypt('CHANGE-ME-123456', extensions.gen_salt('bf', 10)), -- <<< CHANGE ME: 6-12 digit PIN
       failed_pin_count = 0, pin_locked_until = null
 where upper(employee_id) = upper('ADMIN01');            -- <<< same Employee ID as above
