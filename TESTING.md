# Manual acceptance checklist (run on your own Supabase project)

Prepare: run `seed.sql` and `setup_admin.sql`, and pick a future date **D**.

| # | Steps | Expected |
|---|---|---|
| 1 | Log in as EMP001 (Shift A) → click D → enter a reason → **Save Booking** | Green message; D shows `A 1/2` |
| 2 | EMP002 books D. Then EMP003 (Shift A) clicks D | `A 2/2` in red; modal shows the "contact supervisor" message; no Save button |
| 3 | EMP004 (Shift B) clicks D | `B 0/2` or `B 1/2`, booking succeeds |
| 4 | Log in as admin → การจองทั้งหมด → **Add Special Booking** → EMP003, D, approver, time → confirm | Row marked **พิเศษ**; D shows `A 3/2*`; ประวัติการแก้ไข shows "การจองพิเศษ" |
| 5 | Run `npm run test:db` against a test DB (10 parallel requests) | Exactly 2 succeed |
| 6 | Admin: เดือน = month of D, กะ = A → ค้นหา → **Export to Excel** | `.xlsx` has the 14 columns, only Shift A rows of that month, and the filters on the "Report Info" sheet |
| 7 | Using an employee token, call `POST /rest/v1/rpc/admin_list_bookings` (curl below) | HTTP 403 `FORBIDDEN` |
| 8 | Log in with an existing ID and then with `NOPE999` | First opens the calendar; second shows "ไม่พบรหัสพนักงานนี้" |
| 9 | Admin cancels EMP001's booking on D | The count drops by 1; the row is still listed with status ยกเลิกแล้ว and appears in the export |

Test 7 with curl:
```bash
URL=https://xxxx.supabase.co; KEY=<anon key>
TOKEN=$(curl -s -X POST $URL/rest/v1/rpc/login -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"p_employee_id":"EMP001"}' | jq -r .token)
curl -i -X POST $URL/rest/v1/rpc/admin_list_bookings -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d "{\"p_token\":\"$TOKEN\"}"          # -> 403 {"message":"FORBIDDEN"}
curl -i $URL/rest/v1/leave_bookings -H "apikey: $KEY"   # -> 401/403 permission denied
```
