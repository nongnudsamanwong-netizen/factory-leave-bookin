-- OPTIONAL sample employees for testing. Do NOT run on production.
-- Contains no booking records.
insert into public.employees (employee_id, full_name, department, shift, role) values
  ('EMP001', 'สมชาย ใจดี',      'Production', 'A', 'employee'),
  ('EMP002', 'สมหญิง รักงาน',   'Production', 'A', 'employee'),
  ('EMP003', 'วิชัย มั่นคง',     'Assembly',   'A', 'employee'),
  ('EMP004', 'มาลี ศรีสุข',      'Production', 'B', 'employee'),
  ('EMP005', 'ประเสริฐ ทองดี',   'Assembly',   'B', 'employee'),
  ('EMP006', 'นภา แสงทอง',      'Quality',    'B', 'employee')
on conflict ((upper(employee_id))) do nothing;
