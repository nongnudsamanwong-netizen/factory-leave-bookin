-- =====================================================================
-- Factory Leave Booking System — database schema & server-side logic
-- Target: Supabase (PostgreSQL 15+)
--
-- Security model
--   * The browser only holds the public "anon" key.
--   * ALL tables have Row Level Security enabled and NO policies for
--     anon/authenticated, and table privileges are revoked. The browser
--     therefore cannot read or write any table directly.
--   * The browser may only call the SECURITY DEFINER functions (RPC)
--     defined below. Each function validates a server-issued session
--     token, loads the employee (shift, department, role) from the
--     database, and enforces every business rule itself.
--   * Quota enforcement is atomic: a transaction-scoped advisory lock per
--     (date, shift) serialises concurrent bookings for the last slot.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings(key, value) values
  ('daily_quota_per_shift', '2'),
  ('timezone', 'Asia/Bangkok'),
  ('session_hours', '12'),
  ('max_days_ahead', '365')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Employees
-- ---------------------------------------------------------------------
create table if not exists public.employees (
  id                 uuid primary key default extensions.gen_random_uuid(),
  employee_id        text not null,
  full_name          text not null,
  department         text not null,
  shift              text not null check (shift in ('A','B')),
  role               text not null default 'employee' check (role in ('employee','admin')),
  admin_pin_hash     text,                       -- bcrypt hash, admins only
  failed_pin_count   int  not null default 0,
  pin_locked_until   timestamptz,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint employees_employee_id_format check (employee_id ~ '^[A-Za-z0-9_-]{1,30}$'),
  constraint employees_full_name_len check (char_length(btrim(full_name)) between 1 and 120),
  constraint employees_department_len check (char_length(btrim(department)) between 1 and 80)
);
create unique index if not exists employees_employee_id_uq on public.employees (upper(employee_id));

-- ---------------------------------------------------------------------
-- Sessions (server-issued opaque tokens; only the SHA-256 hash is stored)
-- ---------------------------------------------------------------------
create table if not exists public.sessions (
  token_hash   text primary key,
  employee_ref uuid not null references public.employees(id) on delete cascade,
  is_admin     boolean not null default false,  -- true only if admin PIN was verified
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index if not exists sessions_employee_idx on public.sessions(employee_ref);

-- ---------------------------------------------------------------------
-- Leave bookings
-- ---------------------------------------------------------------------
create table if not exists public.leave_bookings (
  id             bigint generated always as identity primary key,
  employee_id    uuid not null references public.employees(id),
  leave_date     date not null,
  shift          text not null check (shift in ('A','B')),       -- snapshot from employees
  department     text not null,                                   -- snapshot from employees
  leave_reason   text not null check (char_length(btrim(leave_reason)) between 1 and 500),
  status         text not null default 'active' check (status in ('active','cancelled')),
  booking_type   text not null default 'normal' check (booking_type in ('normal','special')),
  approved_by    text,
  approved_at    timestamptz,
  approval_note  text,
  created_by     uuid not null references public.employees(id),
  cancelled_by   uuid references public.employees(id),
  cancelled_at   timestamptz,
  cancel_reason  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint special_requires_approval check (
    booking_type = 'normal' or (approved_by is not null and approved_at is not null)
  ),
  constraint cancelled_fields check (
    status = 'active' or cancelled_at is not null
  )
);
-- one active booking per employee per date (rule 6)
create unique index if not exists leave_bookings_one_active_per_day
  on public.leave_bookings(employee_id, leave_date) where status = 'active';
create index if not exists leave_bookings_date_shift_active
  on public.leave_bookings(leave_date, shift) where status = 'active';
create index if not exists leave_bookings_leave_date on public.leave_bookings(leave_date);
create index if not exists leave_bookings_employee on public.leave_bookings(employee_id);

-- ---------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------
create table if not exists public.audit_logs (
  id                  bigint generated always as identity primary key,
  actor_id            uuid references public.employees(id),
  action              text not null,
  affected_record_id  text,
  previous_values     jsonb,
  new_values          jsonb,
  created_at          timestamptz not null default now()
);
create index if not exists audit_logs_created_at on public.audit_logs(created_at desc);

-- ---------------------------------------------------------------------
-- Lock down tables: RLS on, no policies, no privileges for API roles
-- ---------------------------------------------------------------------
alter table public.app_settings   enable row level security;
alter table public.employees      enable row level security;
alter table public.sessions       enable row level security;
alter table public.leave_bookings enable row level security;
alter table public.audit_logs     enable row level security;

alter table public.app_settings   force row level security;
alter table public.employees      force row level security;
alter table public.sessions       force row level security;
alter table public.leave_bookings force row level security;
alter table public.audit_logs     force row level security;

-- The table owner (postgres) runs the SECURITY DEFINER functions. Because
-- FORCE RLS applies even to the owner, give the owner an explicit policy.
do $$
declare t text;
begin
  foreach t in array array['app_settings','employees','sessions','leave_bookings','audit_logs'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format('create policy owner_all on public.%I for all to %I using (true) with check (true)',
                   t, current_user);
  end loop;
end $$;

revoke all on public.app_settings, public.employees, public.sessions,
              public.leave_bookings, public.audit_logs from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.app_settings, public.employees, public.sessions, public.leave_bookings, public.audit_logs from anon';
    execute 'revoke all on all sequences in schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public.app_settings, public.employees, public.sessions, public.leave_bookings, public.audit_logs from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
  end if;
end $$;

-- =====================================================================
-- Internal helpers (NOT callable from the API)
-- =====================================================================

create or replace function public._setting(p_key text)
returns text language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public._today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce(public._setting('timezone'),'Asia/Bangkok'))::date
$$;

create or replace function public._quota()
returns int language sql stable security definer set search_path = public as $$
  select coalesce(public._setting('daily_quota_per_shift')::int, 2)
$$;

create or replace function public._hash_token(p_token text)
returns text language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

-- Resolve a session token to the employee row. Raises UNAUTHORIZED.
create or replace function public._session_employee(p_token text)
returns public.employees
language plpgsql stable security definer set search_path = public, extensions as $$
declare e public.employees;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  select emp.* into e
    from public.sessions s join public.employees emp on emp.id = s.employee_ref
   where s.token_hash = public._hash_token(p_token)
     and s.expires_at > now()
     and emp.is_active;
  if not found then
    raise exception 'UNAUTHORIZED' using errcode = '28000';
  end if;
  return e;
end $$;

-- Same as above, but additionally requires an admin session (role=admin
-- in the database AND the session was opened with a verified admin PIN).
create or replace function public._require_admin(p_token text)
returns public.employees
language plpgsql stable security definer set search_path = public, extensions as $$
declare e public.employees; v_is_admin boolean;
begin
  e := public._session_employee(p_token);
  select s.is_admin into v_is_admin from public.sessions s
   where s.token_hash = public._hash_token(p_token);
  if e.role <> 'admin' or not coalesce(v_is_admin,false) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return e;
end $$;

create or replace function public._audit(p_actor uuid, p_action text, p_record text,
                                         p_prev jsonb, p_new jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs(actor_id, action, affected_record_id, previous_values, new_values)
  values (p_actor, p_action, p_record, p_prev, p_new);
$$;

-- Serialise all booking writes for one (date, shift) pair.
create or replace function public._lock_slot(p_date date, p_shift text)
returns void language sql security definer set search_path = public as $$
  select pg_advisory_xact_lock(hashtextextended('leave:' || p_date::text || ':' || p_shift, 0));
$$;

create or replace function public._active_count(p_date date, p_shift text)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.leave_bookings
   where leave_date = p_date and shift = p_shift and status = 'active'
$$;

create or replace function public._employee_json(e public.employees)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'id', e.id, 'employee_id', e.employee_id, 'full_name', e.full_name,
    'department', e.department, 'shift', e.shift, 'role', e.role)
$$;

create or replace function public._booking_json(b public.leave_bookings)
returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(b) - 'employee_id' - 'created_by' - 'cancelled_by'
    || jsonb_build_object(
      'employee_ref', b.employee_id,
      'employee_code', e.employee_id,
      'employee_name', e.full_name,
      'created_by_code', c.employee_id,
      'created_by_name', c.full_name,
      'cancelled_by_code', x.employee_id)
  from public.employees e
  join public.employees c on c.id = b.created_by
  left join public.employees x on x.id = b.cancelled_by
  where e.id = b.employee_id
$$;

-- =====================================================================
-- Public API (RPC)
-- =====================================================================

-- ---- Login ----------------------------------------------------------
-- Employees: Employee ID only.  Admins: Employee ID + admin PIN.
-- Returns {status:'ok', token, employee} or {status:'pin_required'}.
create or replace function public.login(p_employee_id text, p_pin text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  e public.employees;
  v_token text;
  v_admin boolean := false;
begin
  if p_employee_id is null or btrim(p_employee_id) !~ '^[A-Za-z0-9_-]{1,30}$' then
    raise exception 'INVALID_EMPLOYEE_ID';
  end if;

  select * into e from public.employees
   where upper(employee_id) = upper(btrim(p_employee_id)) and is_active;
  if not found then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;

  if e.role = 'admin' then
    if p_pin is null or p_pin = '' then
      return jsonb_build_object('status','pin_required');
    end if;
    if e.pin_locked_until is not null and e.pin_locked_until > now() then
      raise exception 'PIN_LOCKED';
    end if;
    if e.admin_pin_hash is null then
      raise exception 'PIN_NOT_CONFIGURED';
    end if;
    if extensions.crypt(p_pin, e.admin_pin_hash) <> e.admin_pin_hash then
      update public.employees
         set failed_pin_count = failed_pin_count + 1,
             pin_locked_until = case when failed_pin_count + 1 >= 5
                                     then now() + interval '15 minutes' end
       where id = e.id;
      perform public._audit(e.id, 'admin_login_failed', e.id::text, null, null);
      return jsonb_build_object('status','pin_invalid');
    end if;
    update public.employees set failed_pin_count = 0, pin_locked_until = null where id = e.id;
    v_admin := true;
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  delete from public.sessions where expires_at < now();
  insert into public.sessions(token_hash, employee_ref, is_admin, expires_at)
  values (public._hash_token(v_token), e.id, v_admin,
          now() + make_interval(hours => coalesce(public._setting('session_hours')::int, 12)));

  if v_admin then
    perform public._audit(e.id, 'admin_login', e.id::text, null, null);
  end if;

  return jsonb_build_object('status','ok','token', v_token,
                            'employee', public._employee_json(e),
                            'is_admin', v_admin);
end $$;

create or replace function public.logout(p_token text)
returns void language sql volatile security definer set search_path = public, extensions as $$
  delete from public.sessions where token_hash = public._hash_token(p_token);
$$;

create or replace function public.me(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare e public.employees; v_admin boolean;
begin
  e := public._session_employee(p_token);
  select is_admin into v_admin from public.sessions where token_hash = public._hash_token(p_token);
  return jsonb_build_object('employee', public._employee_json(e),
                            'is_admin', coalesce(v_admin,false) and e.role = 'admin',
                            'today', public._today(), 'quota', public._quota());
end $$;

-- ---- Calendar counts -------------------------------------------------
-- Aggregate counts only (no names/reasons) for any logged-in employee.
create or replace function public.get_calendar_counts(p_token text, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare e public.employees;
begin
  e := public._session_employee(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'INVALID_RANGE';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'leave_date', leave_date, 'shift', shift,
             'count', cnt, 'special_count', sp) order by leave_date, shift)
      from (select leave_date, shift, count(*)::int cnt,
                   count(*) filter (where booking_type='special')::int sp
              from public.leave_bookings
             where status = 'active' and leave_date between p_from and p_to
             group by leave_date, shift) x
  ), '[]'::jsonb);
end $$;

-- ---- Own bookings ----------------------------------------------------
create or replace function public.get_my_bookings(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare e public.employees;
begin
  e := public._session_employee(p_token);
  return coalesce((
    select jsonb_agg(public._booking_json(b) order by b.leave_date desc)
      from public.leave_bookings b where b.employee_id = e.id
  ), '[]'::jsonb);
end $$;

-- ---- Normal booking (employee) ---------------------------------------
create or replace function public.book_leave(p_token text, p_leave_date date, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  e public.employees;
  v_reason text := btrim(coalesce(p_reason,''));
  v_count int;
  b public.leave_bookings;
begin
  -- 1. identity from server-side session (never from the browser)
  e := public._session_employee(p_token);

  -- 2. validate input
  if p_leave_date is null then raise exception 'INVALID_DATE'; end if;
  if char_length(v_reason) < 1 then raise exception 'REASON_REQUIRED'; end if;
  if char_length(v_reason) > 500 then raise exception 'REASON_TOO_LONG'; end if;
  if p_leave_date < public._today() then raise exception 'PAST_DATE'; end if;
  if p_leave_date > public._today() + coalesce(public._setting('max_days_ahead')::int, 365) then
    raise exception 'TOO_FAR_AHEAD';
  end if;

  -- 3. atomic section: lock (date, shift) for the rest of the transaction
  perform public._lock_slot(p_leave_date, e.shift);

  -- 4. duplicate check
  if exists (select 1 from public.leave_bookings
              where employee_id = e.id and leave_date = p_leave_date and status = 'active') then
    raise exception 'DUPLICATE_BOOKING';
  end if;

  -- 5. quota check with the latest committed data
  v_count := public._active_count(p_leave_date, e.shift);
  if v_count >= public._quota() then
    raise exception 'QUOTA_FULL';
  end if;

  -- 6. save (shift & department come from the employees table)
  insert into public.leave_bookings(employee_id, leave_date, shift, department, leave_reason,
                                    status, booking_type, created_by)
  values (e.id, p_leave_date, e.shift, e.department, v_reason, 'active', 'normal', e.id)
  returning * into b;

  perform public._audit(e.id, 'booking_created', b.id::text, null, to_jsonb(b));

  return public._booking_json(b) || jsonb_build_object('shift_count', v_count + 1,
                                                        'quota', public._quota());
end $$;

-- ---- Employee cancels own future booking -----------------------------
create or replace function public.cancel_my_booking(p_token text, p_booking_id bigint)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare e public.employees; b public.leave_bookings; prev jsonb;
begin
  e := public._session_employee(p_token);
  select * into b from public.leave_bookings where id = p_booking_id for update;
  if not found or b.employee_id <> e.id then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'active' then raise exception 'ALREADY_CANCELLED'; end if;
  if b.leave_date < public._today() then raise exception 'PAST_DATE'; end if;
  prev := to_jsonb(b);
  update public.leave_bookings
     set status='cancelled', cancelled_by=e.id, cancelled_at=now(),
         cancel_reason='ยกเลิกโดยพนักงาน', updated_at=now()
   where id = b.id returning * into b;
  perform public._audit(e.id, 'booking_cancelled_by_employee', b.id::text, prev, to_jsonb(b));
  return public._booking_json(b);
end $$;

-- =====================================================================
-- Administrator API — every function starts with _require_admin()
-- =====================================================================

create or replace function public.admin_list_employees(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a public.employees;
begin
  a := public._require_admin(p_token);
  return coalesce((
    select jsonb_agg(public._employee_json(e)
                     || jsonb_build_object('is_active', e.is_active,
                                           'has_pin', e.admin_pin_hash is not null,
                                           'created_at', e.created_at,
                                           'updated_at', e.updated_at)
                     order by e.employee_id)
      from public.employees e
  ), '[]'::jsonb);
end $$;

-- Create (p_id null) or update an employee. Role changes are only possible here.
create or replace function public.admin_save_employee(
  p_token text, p_id uuid, p_employee_id text, p_full_name text,
  p_department text, p_shift text, p_role text, p_is_active boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.employees; e public.employees; prev jsonb;
begin
  a := public._require_admin(p_token);
  if p_employee_id is null or btrim(p_employee_id) !~ '^[A-Za-z0-9_-]{1,30}$' then
    raise exception 'INVALID_EMPLOYEE_ID';
  end if;
  if p_shift not in ('A','B') then raise exception 'INVALID_SHIFT'; end if;
  if p_role not in ('employee','admin') then raise exception 'INVALID_ROLE'; end if;
  if char_length(btrim(coalesce(p_full_name,''))) not between 1 and 120 then raise exception 'INVALID_NAME'; end if;
  if char_length(btrim(coalesce(p_department,''))) not between 1 and 80 then raise exception 'INVALID_DEPARTMENT'; end if;

  if p_id is null then
    if exists (select 1 from public.employees where upper(employee_id) = upper(btrim(p_employee_id))) then
      raise exception 'EMPLOYEE_ID_EXISTS';
    end if;
    insert into public.employees(employee_id, full_name, department, shift, role, is_active)
    values (btrim(p_employee_id), btrim(p_full_name), btrim(p_department), p_shift, p_role,
            coalesce(p_is_active, true))
    returning * into e;
    perform public._audit(a.id, 'employee_created', e.id::text, null,
                          to_jsonb(e) - 'admin_pin_hash');
  else
    select * into e from public.employees where id = p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if e.id = a.id and (p_role <> 'admin' or not coalesce(p_is_active,true)) then
      raise exception 'CANNOT_DEMOTE_SELF';
    end if;
    if exists (select 1 from public.employees
                where upper(employee_id) = upper(btrim(p_employee_id)) and id <> p_id) then
      raise exception 'EMPLOYEE_ID_EXISTS';
    end if;
    prev := to_jsonb(e) - 'admin_pin_hash';
    update public.employees
       set employee_id = btrim(p_employee_id), full_name = btrim(p_full_name),
           department = btrim(p_department), shift = p_shift, role = p_role,
           is_active = coalesce(p_is_active, true),
           admin_pin_hash = case when p_role = 'admin' then admin_pin_hash end,
           updated_at = now()
     where id = p_id returning * into e;
    -- revoke sessions if role/active status changed
    if (prev->>'role') <> e.role or (prev->>'is_active')::boolean <> e.is_active then
      delete from public.sessions where employee_ref = e.id;
    end if;
    perform public._audit(a.id,
      case when (prev->>'role') <> e.role then 'employee_role_changed' else 'employee_updated' end,
      e.id::text, prev, to_jsonb(e) - 'admin_pin_hash');
  end if;
  return public._employee_json(e) || jsonb_build_object('is_active', e.is_active);
end $$;

create or replace function public.admin_set_pin(p_token text, p_employee uuid, p_pin text)
returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.employees; e public.employees;
begin
  a := public._require_admin(p_token);
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then raise exception 'INVALID_PIN'; end if;
  select * into e from public.employees where id = p_employee;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.role <> 'admin' then raise exception 'NOT_ADMIN'; end if;
  update public.employees
     set admin_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         failed_pin_count = 0, pin_locked_until = null, updated_at = now()
   where id = e.id;
  perform public._audit(a.id, 'admin_pin_set', e.id::text, null, null);
end $$;

-- Filtered booking list (also used for Excel export)
create or replace function public.admin_list_bookings(
  p_token text,
  p_from date default null, p_to date default null,
  p_department text default null, p_shift text default null,
  p_status text default null, p_type text default null,
  p_search text default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a public.employees; v_search text := nullif(btrim(coalesce(p_search,'')), '');
begin
  a := public._require_admin(p_token);
  return coalesce((
    select jsonb_agg(public._booking_json(b) order by b.leave_date, b.shift, b.created_at)
      from public.leave_bookings b
      join public.employees e on e.id = b.employee_id
     where (p_from is null or b.leave_date >= p_from)
       and (p_to   is null or b.leave_date <= p_to)
       and (p_department is null or p_department = '' or b.department = p_department)
       and (p_shift  is null or p_shift  = '' or b.shift = p_shift)
       and (p_status is null or p_status = '' or b.status = p_status)
       and (p_type   is null or p_type   = '' or b.booking_type = p_type)
       and (v_search is null
            or e.employee_id ilike '%' || v_search || '%'
            or e.full_name   ilike '%' || v_search || '%')
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_cancel_booking(p_token text, p_booking_id bigint, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.employees; b public.leave_bookings; prev jsonb;
begin
  a := public._require_admin(p_token);
  select * into b from public.leave_bookings where id = p_booking_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'active' then raise exception 'ALREADY_CANCELLED'; end if;
  prev := to_jsonb(b);
  update public.leave_bookings
     set status = 'cancelled', cancelled_by = a.id, cancelled_at = now(),
         cancel_reason = nullif(btrim(coalesce(p_reason,'')), ''), updated_at = now()
   where id = b.id returning * into b;
  perform public._audit(a.id, 'booking_cancelled_by_admin', b.id::text, prev, to_jsonb(b));
  return public._booking_json(b);
end $$;

-- Correct an existing active booking (reason and/or date).
-- Moving a NORMAL booking to another date re-checks that date's quota.
create or replace function public.admin_update_booking(
  p_token text, p_booking_id bigint, p_leave_date date, p_reason text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.employees; b public.leave_bookings; prev jsonb;
        v_reason text := btrim(coalesce(p_reason,''));
begin
  a := public._require_admin(p_token);
  if char_length(v_reason) not between 1 and 500 then raise exception 'REASON_REQUIRED'; end if;
  if p_leave_date is null then raise exception 'INVALID_DATE'; end if;
  select * into b from public.leave_bookings where id = p_booking_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if b.status <> 'active' then raise exception 'ALREADY_CANCELLED'; end if;

  if p_leave_date <> b.leave_date then
    perform public._lock_slot(p_leave_date, b.shift);
    if exists (select 1 from public.leave_bookings
                where employee_id = b.employee_id and leave_date = p_leave_date
                  and status = 'active' and id <> b.id) then
      raise exception 'DUPLICATE_BOOKING';
    end if;
    if b.booking_type = 'normal'
       and public._active_count(p_leave_date, b.shift) >= public._quota() then
      raise exception 'QUOTA_FULL';
    end if;
  end if;

  select * into b from public.leave_bookings where id = p_booking_id for update;
  prev := to_jsonb(b);
  update public.leave_bookings
     set leave_date = p_leave_date, leave_reason = v_reason, updated_at = now()
   where id = b.id returning * into b;
  perform public._audit(a.id, 'booking_updated_by_admin', b.id::text, prev, to_jsonb(b));
  return public._booking_json(b);
end $$;

-- Special (exceptional) booking — may exceed the normal quota.
create or replace function public.admin_special_booking(
  p_token text, p_employee uuid, p_leave_date date, p_reason text,
  p_approved_by text, p_approved_at timestamptz, p_approval_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare a public.employees; e public.employees; b public.leave_bookings;
        v_reason text := btrim(coalesce(p_reason,''));
        v_count int;
begin
  a := public._require_admin(p_token);
  select * into e from public.employees where id = p_employee and is_active;
  if not found then raise exception 'EMPLOYEE_NOT_FOUND'; end if;
  if p_leave_date is null then raise exception 'INVALID_DATE'; end if;
  if char_length(v_reason) not between 1 and 500 then raise exception 'REASON_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_approved_by,''))) not between 1 and 120 then
    raise exception 'APPROVER_REQUIRED';
  end if;
  if p_approved_at is null then raise exception 'APPROVAL_TIME_REQUIRED'; end if;
  if p_approved_at > now() + interval '5 minutes' then raise exception 'APPROVAL_TIME_FUTURE'; end if;

  perform public._lock_slot(p_leave_date, e.shift);
  if exists (select 1 from public.leave_bookings
              where employee_id = e.id and leave_date = p_leave_date and status = 'active') then
    raise exception 'DUPLICATE_BOOKING';
  end if;
  v_count := public._active_count(p_leave_date, e.shift);

  insert into public.leave_bookings(employee_id, leave_date, shift, department, leave_reason,
                                    status, booking_type, approved_by, approved_at,
                                    approval_note, created_by)
  values (e.id, p_leave_date, e.shift, e.department, v_reason, 'active', 'special',
          btrim(p_approved_by), p_approved_at,
          nullif(btrim(coalesce(p_approval_note,'')), ''), a.id)
  returning * into b;

  perform public._audit(a.id, 'special_booking_created', b.id::text,
                        jsonb_build_object('shift_count_before', v_count, 'quota', public._quota()),
                        to_jsonb(b));
  return public._booking_json(b) || jsonb_build_object('shift_count', v_count + 1);
end $$;

create or replace function public.admin_audit_logs(p_token text, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare a public.employees;
begin
  a := public._require_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'action', l.action, 'affected_record_id', l.affected_record_id,
             'previous_values', l.previous_values, 'new_values', l.new_values,
             'created_at', l.created_at,
             'actor_code', e.employee_id, 'actor_name', e.full_name) order by l.id desc)
      from (select * from public.audit_logs order by id desc
             limit least(greatest(coalesce(p_limit,200),1),1000)) l
      left join public.employees e on e.id = l.actor_id
  ), '[]'::jsonb);
end $$;

-- =====================================================================
-- Function privileges: internal helpers are private; API is anon-callable
-- =====================================================================
revoke execute on all functions in schema public from public;
do $$
declare r text;
begin
  foreach r in array array['anon','authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on all functions in schema public from %I', r);
      execute format('grant execute on function
          public.login(text,text), public.logout(text), public.me(text),
          public.get_calendar_counts(text,date,date), public.get_my_bookings(text),
          public.book_leave(text,date,text), public.cancel_my_booking(text,bigint),
          public.admin_list_employees(text),
          public.admin_save_employee(text,uuid,text,text,text,text,text,boolean),
          public.admin_set_pin(text,uuid,text),
          public.admin_list_bookings(text,date,date,text,text,text,text,text),
          public.admin_cancel_booking(text,bigint,text),
          public.admin_update_booking(text,bigint,date,text),
          public.admin_special_booking(text,uuid,date,text,text,timestamptz,text),
          public.admin_audit_logs(text,int) to %I', r);
    end if;
  end loop;
end $$;
