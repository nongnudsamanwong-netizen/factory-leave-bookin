-- Acceptance tests 1-4, 6-9 (Test 5 concurrency is in run_tests.sh).
-- Runs as the "anon" role — exactly what the browser can do.
-- Requires seed.sql + setup_admin.sql with PIN 'CHANGE-ME-123456' replaced by
-- the test runner (run_tests.sh sets PIN 246810).
\set ON_ERROR_STOP 1
set role anon;

do $$
declare
  t_emp1 text; t_emp2 text; t_emp3 text; t_empB text; t_admin text;
  d date := (now() at time zone 'Asia/Bangkok')::date + 30;
  r jsonb; c jsonb; v_err text; v_id bigint; v_emp3 uuid; n int;

begin
  ------------------------------------------------------------------ Test 8
  r := public.login('EMP001');
  assert r->>'status' = 'ok' and r->'employee'->>'shift' = 'A', 'T8 existing ID should log in';
  t_emp1 := r->>'token';
  begin
    perform public.login('NOPE999');
    raise exception 'T8 FAILED: unknown ID accepted';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'EMPLOYEE_NOT_FOUND', 'T8 unexpected error ' || v_err;
  end;
  -- case-insensitive
  assert public.login('emp002')->>'status' = 'ok', 'T8 lowercase ID';
  t_emp2 := public.login('EMP002')->>'token';
  t_emp3 := public.login('EMP003')->>'token';
  t_empB := public.login('EMP004')->>'token';
  -- admin: PIN required, wrong PIN rejected, correct PIN ok
  assert public.login('ADMIN01')->>'status' = 'pin_required', 'T8 admin needs PIN';
  assert public.login('ADMIN01','000000')->>'status' = 'pin_invalid', 'T8 wrong PIN';
  r := public.login('ADMIN01','246810');
  assert r->>'status' = 'ok' and (r->>'is_admin')::boolean, 'T8 admin login';
  t_admin := r->>'token';
  raise notice 'PASS Test 8: login validation';

  ------------------------------------------------------------------ Test 1
  r := public.book_leave(t_emp1, d, 'ธุระส่วนตัว');
  assert r->>'booking_type' = 'normal' and r->>'shift' = 'A', 'T1 booking saved';
  c := public.get_calendar_counts(t_emp1, d, d);
  assert (select (x->>'count')::int from jsonb_array_elements(c) x where x->>'shift'='A') = 1,
         'T1 Shift A should show 1/2';
  raise notice 'PASS Test 1: normal booking -> Shift A 1/2';

  -- duplicate booking rejected
  begin
    perform public.book_leave(t_emp1, d, 'again');
    raise exception 'DUP FAILED';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'DUPLICATE_BOOKING', 'duplicate: ' || v_err;
  end;
  -- past date rejected
  begin
    perform public.book_leave(t_emp1, d - 60, 'past');
    raise exception 'PAST FAILED';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'PAST_DATE', 'past: ' || v_err;
  end;
  -- empty reason rejected
  begin
    perform public.book_leave(t_emp2, d, '   ');
    raise exception 'REASON FAILED';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'REASON_REQUIRED', 'reason: ' || v_err;
  end;
  raise notice 'PASS extra: duplicate / past date / empty reason rejected';

  ------------------------------------------------------------------ Test 2
  perform public.book_leave(t_emp2, d, 'พาครอบครัวไปหาหมอ');
  begin
    perform public.book_leave(t_emp3, d, 'เที่ยว');
    raise exception 'T2 FAILED: 3rd booking accepted';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'QUOTA_FULL', 'T2 unexpected ' || v_err;
  end;
  raise notice 'PASS Test 2: quota reached -> QUOTA_FULL';

  ------------------------------------------------------------------ Test 3
  r := public.book_leave(t_empB, d, 'งานบวช');
  assert r->>'shift' = 'B', 'T3 shift B booking';
  c := public.get_calendar_counts(t_emp1, d, d);
  assert (select (x->>'count')::int from jsonb_array_elements(c) x where x->>'shift'='A') = 2, 'T3 A=2';
  assert (select (x->>'count')::int from jsonb_array_elements(c) x where x->>'shift'='B') = 1, 'T3 B=1';
  raise notice 'PASS Test 3: independent shifts (A 2/2, B 1/2 still bookable)';

  ------------------------------------------------------------------ Test 4
  select (x->>'id')::uuid into v_emp3
    from jsonb_array_elements(public.admin_list_employees(t_admin)) x
   where x->>'employee_id' = 'EMP003';
  r := public.admin_special_booking(t_admin, v_emp3, d, 'งานศพญาติ',
                                    'SUP01 หัวหน้ากะ A', now() - interval '1 hour', 'อนุมัติทางโทรศัพท์');
  assert r->>'booking_type' = 'special' and r->>'created_by_code' = 'ADMIN01', 'T4 special flagged';
  v_id := (r->>'id')::bigint;
  c := public.get_calendar_counts(t_emp1, d, d);
  assert (select (x->>'count')::int from jsonb_array_elements(c) x where x->>'shift'='A') = 3, 'T4 A=3';
  assert exists (select 1 from jsonb_array_elements(public.admin_audit_logs(t_admin)) l
                  where l->>'action' = 'special_booking_created'
                    and l->>'affected_record_id' = v_id::text
                    and l->>'actor_code' = 'ADMIN01'), 'T4 audit log';
  -- special requires approver
  begin
    perform public.admin_special_booking(t_admin, v_emp3, d + 1, 'x', '', now(), null);
    raise exception 'T4 approver FAILED';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'APPROVER_REQUIRED', 'T4 approver ' || v_err;
  end;
  raise notice 'PASS Test 4: special booking over quota, flagged and audited';

  ------------------------------------------------------------------ Test 7
  begin
    perform public.admin_list_bookings(t_emp1);
    raise exception 'T7 FAILED: employee listed bookings';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'FORBIDDEN', 'T7 ' || v_err;
  end;
  begin
    perform public.admin_special_booking(t_emp1, v_emp3, d, 'x', 'me', now(), null);
    raise exception 'T7 FAILED: employee special booking';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'FORBIDDEN', 'T7b ' || v_err;
  end;
  begin
    perform public.admin_save_employee(t_emp1, null, 'HACK1', 'x', 'x', 'A', 'admin', true);
    raise exception 'T7 FAILED: employee created admin';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'FORBIDDEN', 'T7c ' || v_err;
  end;
  begin
    perform public.admin_list_bookings('forged-token-forged-token-forged-token-1234');
    raise exception 'T7 FAILED: forged token';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'UNAUTHORIZED', 'T7d ' || v_err;
  end;
  begin
    perform 1 from public.leave_bookings;
    raise exception 'T7 FAILED: direct table read';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.leave_bookings(employee_id, leave_date, shift, department, leave_reason, created_by)
    select id, d, 'A', 'x', 'x', id from public.employees limit 1;
    raise exception 'T7 FAILED: direct insert';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._require_admin(t_emp1);
    raise exception 'T7 FAILED: internal helper callable';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS Test 7: access control enforced by backend';

  ------------------------------------------------------------------ Test 9
  select (x->>'id')::bigint into v_id from jsonb_array_elements(public.get_my_bookings(t_emp1)) x
   where (x->>'leave_date')::date = d;
  perform public.admin_cancel_booking(t_admin, v_id, 'พนักงานขอเปลี่ยนวัน');
  c := public.get_calendar_counts(t_emp1, d, d);
  assert (select (x->>'count')::int from jsonb_array_elements(c) x where x->>'shift'='A') = 2,
         'T9 cancelled not counted';
  assert exists (select 1 from jsonb_array_elements(
                   public.admin_list_bookings(t_admin, d, d, null, 'A', 'cancelled')) x
                  where (x->>'id')::bigint = v_id), 'T9 history kept';
  -- employee may book again the same date after cancellation? only if quota allows (A=2 incl special) -> full
  begin
    perform public.book_leave(t_emp1, d, 'ใหม่');
    raise exception 'T9 rebook should be full';
  exception when others then
    get stacked diagnostics v_err = message_text;
    assert v_err = 'QUOTA_FULL', 'T9 ' || v_err;
  end;
  raise notice 'PASS Test 9: cancelled booking excluded from quota, history kept';

  ------------------------------------------------------------------ Test 6 (data side)
  r := public.admin_list_bookings(t_admin, date_trunc('month', d)::date,
                                  (date_trunc('month', d) + interval '1 month - 1 day')::date,
                                  null, 'A', null, null, null);
  select count(*) into n from jsonb_array_elements(r) x where x->>'shift' <> 'A';
  assert n = 0 and jsonb_array_length(r) = 3, 'T6 month+shift filter, got ' || jsonb_array_length(r);
  raise notice 'PASS Test 6 (data): month + shift filter returns % Shift A rows', jsonb_array_length(r);
end $$;
