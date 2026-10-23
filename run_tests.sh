#!/usr/bin/env bash
# Runs the database acceptance tests against a THROWAWAY PostgreSQL database.
# Usage: PGURL=postgres://user:pass@host:port/db ./supabase/tests/run_tests.sh
# Never point this at production: it inserts test employees and bookings.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${PGURL:?set PGURL to a throwaway database}"
P="psql $PGURL -v ON_ERROR_STOP=1 -q"

echo "== applying schema, seed, admin (PIN 246810)"
$P -f supabase/migrations/001_schema.sql >/dev/null 2>&1
$P -f supabase/seed.sql >/dev/null
sed "s/CHANGE-ME-123456/246810/" supabase/setup_admin.sql | $P >/dev/null

echo "== Tests 1,2,3,4,6,7,8,9"
$P -f supabase/tests/acceptance.sql 2>&1 | sed -n 's/.*NOTICE:  //p'

echo "== Test 5: concurrent booking"
ADMIN=$($P -At -c "set role anon; select public.login('ADMIN01','246810')->>'token'")
for i in $(seq 1 10); do
  $P -At -c "set role anon; select public.admin_save_employee('$ADMIN', null, 'CC$i', 'Concurrent $i', 'Test', 'A', 'employee', true)" >/dev/null 2>&1 || true
done
D=$($P -At -c "select ((now() at time zone 'Asia/Bangkok')::date + 45)::text")

# 5a: 10 employees try to book an empty date at the same moment -> exactly 2 succeed
rm -f /tmp/flb_cc_*.out
for i in $(seq 1 10); do
  ( TOKEN=$($P -At -c "set role anon; select public.login('CC$i')->>'token'")
    $P -At -c "set role anon; select pg_sleep(0.5 - (extract(milliseconds from clock_timestamp())::int % 500)/1000.0); select public.book_leave('$TOKEN', '$D', 'concurrency test')->>'id'" \
      >/tmp/flb_cc_$i.out 2>&1 && echo OK >>/tmp/flb_cc_$i.out || true ) &
done
wait
OK=$(grep -l '^OK$' /tmp/flb_cc_*.out | wc -l)
FULL=$(grep -l 'QUOTA_FULL' /tmp/flb_cc_*.out | wc -l)
DB=$($P -At -c "select count(*) from leave_bookings where leave_date='$D' and shift='A' and status='active'")
echo "   10 simultaneous requests: success=$OK quota_full=$FULL rows_in_db=$DB"
[ "$OK" = 2 ] && [ "$DB" = 2 ] || { echo "FAIL Test 5a"; exit 1; }

# 5b: one slot left, two employees book at once; first holds its transaction open 1s
D2=$($P -At -c "select ((now() at time zone 'Asia/Bangkok')::date + 46)::text")
T1=$($P -At -c "set role anon; select public.login('CC1')->>'token'")
T2=$($P -At -c "set role anon; select public.login('CC2')->>'token'")
T3=$($P -At -c "set role anon; select public.login('CC3')->>'token'")
$P -At -c "set role anon; select public.book_leave('$T1', '$D2', 'first')" >/dev/null
( $P -At -c "begin; set local role anon; select public.book_leave('$T2', '$D2', 'slow'); select pg_sleep(1); commit;" >/tmp/flb_b1.out 2>&1 && echo OK >>/tmp/flb_b1.out || true ) &
sleep 0.2
( $P -At -c "set role anon; select public.book_leave('$T3', '$D2', 'fast')" >/tmp/flb_b2.out 2>&1 && echo OK >>/tmp/flb_b2.out || true ) &
wait
DB2=$($P -At -c "select count(*) from leave_bookings where leave_date='$D2' and shift='A' and status='active'")
echo "   last-slot race: slow=$(tail -1 /tmp/flb_b1.out | cut -c1-60) | fast=$(grep -o 'QUOTA_FULL\|^OK$' /tmp/flb_b2.out | head -1) | rows_in_db=$DB2"
[ "$DB2" = 2 ] && grep -q QUOTA_FULL /tmp/flb_b2.out || { echo "FAIL Test 5b"; exit 1; }
echo "PASS Test 5: concurrent booking never exceeds quota"
echo "== ALL DATABASE ACCEPTANCE TESTS PASSED"
