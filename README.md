# Factory Leave Booking System (ระบบจองวันลาพักร้อน)

A web app where factory employees book annual-leave dates. Each shift (A and B) has its own daily quota of 2 people. Administrators manage employees, bookings and special (over-quota) approvals, and export reports to Excel.

> **สรุปภาษาไทย:** พนักงานกรอกรหัสพนักงานเพื่อเข้าสู่ระบบ แล้วดูปฏิทินรายเดือนที่แสดงจำนวนผู้ลาของกะ A (สีน้ำเงิน) และกะ B (สีส้ม) แยกกัน กะละไม่เกิน 2 คนต่อวัน ถ้ากะเต็มแล้ว (สีแดง) ต้องติดต่อหัวหน้างาน จากนั้นผู้ดูแลระบบจะเพิ่ม “การจองพิเศษ” ให้ ผู้ดูแลระบบจัดการพนักงานได้ ดูและยกเลิกหรือแก้ไขการจองได้ และ Export to Excel ได้

| Stack | |
|---|---|
| Frontend | React 18 + TypeScript + Vite, Tailwind CSS, Lucide icons, date-fns |
| Backend / DB | Supabase (PostgreSQL), with all rules in SECURITY DEFINER SQL functions |
| Excel | SheetJS (`xlsx`), loaded only when an admin exports |

Screenshots from the local end-to-end test run are in `docs/screenshots/`.

---

## 1. How it works

```
Browser (anon key only) ──RPC──►  PostgreSQL functions  ──►  tables (RLS on, no API access)
                                  login / book_leave / admin_* ...
```

* The browser **cannot read or write any table**. RLS is enabled with no API policies, and table privileges are revoked from `anon` and `authenticated`.
* The browser may only call the functions listed in `supabase/migrations/001_schema.sql` (they are granted to `anon`).
* `login(employee_id)` returns a random **session token**. Only its SHA-256 hash is stored, it expires after 12 hours, and it is revoked when the employee's role or active status changes.
* Each function resolves the token to the employee **on the server** and loads their shift, department and role from the `employees` table. Shift, department and role sent by the browser are never trusted.
* **Admin functions** require `role = 'admin'` **and** a session opened with the admin PIN.
* **Quota and concurrency:** `book_leave` takes a transaction-scoped `pg_advisory_xact_lock` for each (date, shift), re-counts active bookings, then inserts. Two people can never take the last slot at the same time. A partial unique index stops duplicate active bookings per employee per day.
* **Special bookings** (`admin_special_booking`) skip the quota check. They need an approver plus approval time, are stored with `booking_type = 'special'` and `created_by = <admin>`, and are written to `audit_logs`.
* Cancelled bookings keep their row (`status = 'cancelled'`) but are excluded from quota counts.

### Business rules implemented
| Rule | Where enforced |
|---|---|
| Max 2 normal bookings per shift per date (setting `daily_quota_per_shift`) | `book_leave` (DB) |
| Shift A and Shift B quotas are independent | count by `(leave_date, shift)` |
| No bookings for other people; shift and department can't be edited | identity comes from the session; shift and department are copied from `employees` |
| No past dates (Asia/Bangkok time) and no more than 365 days ahead | `book_leave` |
| No duplicate booking for the same date | function check + partial unique index |
| Special bookings only by an admin, flagged, audited | `admin_special_booking` + `_require_admin` |
| Cancelled bookings don't count | all counts use `status = 'active'` |

---

## 2. Setup (about 15 minutes)

### 2.1 Create the Supabase project
1. Create a free project at https://supabase.com, choosing region **Southeast Asia (Singapore)**.
2. Open **SQL Editor → New query**. Paste the whole of `supabase/migrations/001_schema.sql` and click **Run**. The script is safe to run again.
3. *(Optional, test only)* Run `supabase/seed.sql` to add 6 sample employees. It contains no bookings.

### 2.2 Create the first administrator
1. Open `supabase/setup_admin.sql` and change the Employee ID, name, department and **PIN** (6–12 digits) on the lines marked `<<< CHANGE ME`.
2. Run it in the SQL Editor.
3. Log in to the app with that Employee ID. A PIN field will appear; enter the PIN.
4. From then on, add employees and other admins in **จัดการพนักงาน**. A new admin must have a PIN set (the **PIN** button) before they can log in.

> To import many employees at once, use **Table Editor → employees → Insert → Import CSV** with the columns `employee_id, full_name, department, shift (A/B), role (employee/admin)`.

### 2.3 Run locally
Requires Node.js 18 or later.
```bash
npm install
cp .env.example .env.local      # then fill in the 2 values below
npm run dev                     # http://localhost:5173
```
In `.env.local` (Supabase → Project Settings → API):
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<the "anon public" key>
```
**Never** put the `service_role` key in `.env.local` or anywhere in the frontend. This app does not need it.

### 2.4 Change settings
```sql
update app_settings set value = '3' where key = 'daily_quota_per_shift';  -- quota per shift
update app_settings set value = '180' where key = 'max_days_ahead';        -- booking horizon
```

---

## 3. Deploy

The frontend is a static site (`npm run build` produces `dist/`).

**Vercel**
1. Push the project to GitHub, then go to vercel.com → **Add New Project** → import the repo.
2. Framework: Vite. Build command: `npm run build`. Output folder: `dist`.
3. Add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` → **Deploy**.

**Netlify:** the same steps (build `npm run build`, publish `dist`, same env vars).

**Factory intranet / IIS / nginx:** run `npm run build` with `.env.local` filled in, then copy `dist/` to any web server. No server-side runtime is needed.

After deploying, in Supabase go to **Authentication → URL Configuration** and add your site URL. This is optional, because the app does not use Supabase Auth.

---

## 4. Tests

### Database acceptance tests (Tests 1–9)
Run them against a **throwaway** PostgreSQL database, never production:
```bash
PGURL=postgres://user:pass@localhost:5432/leave_test npm run test:db
```
For a plain PostgreSQL database, first create the Supabase roles: `create role anon nologin; create role authenticated nologin;`

Result of the last run (PostgreSQL 16, schema owned by a non-superuser):
```
PASS Test 8: login validation
PASS Test 1: normal booking -> Shift A 1/2
PASS extra: duplicate / past date / empty reason rejected
PASS Test 2: quota reached -> QUOTA_FULL
PASS Test 3: independent shifts (A 2/2, B 1/2 still bookable)
PASS Test 4: special booking over quota, flagged and audited
PASS Test 7: access control enforced by backend
PASS Test 9: cancelled booking excluded from quota, history kept
PASS Test 6 (data): month + shift filter returns 3 Shift A rows
   10 simultaneous requests: success=2 quota_full=8 rows_in_db=2
   last-slot race: slow=OK | fast=QUOTA_FULL | rows_in_db=2
PASS Test 5: concurrent booking never exceeds quota
```

### Browser end-to-end test
`tests/e2e/e2e.cjs` (Playwright) drives the real UI. It covers login, booking, the quota-full message, independent shifts, a special booking, a month + shift filter followed by an Excel export (it opens the downloaded `.xlsx` and checks the 14 columns and the rows), cancellation, and mobile layout. The last run used PostgREST in place of Supabase's API layer and passed every step. Test 7 was also checked over HTTP: an employee token calling `admin_*` gets `403 FORBIDDEN`, and direct table reads are denied.

### Manual checklist on your Supabase project
Run the list in `docs/TESTING.md` once your project is configured.

---

## 5. Security notice — READ BEFORE USING REAL EMPLOYEE DATA

**Employee ID login is not authentication.** Anyone who knows or guesses an Employee ID can log in as that person, then book or cancel that person's leave and read their own leave reasons. That is the requested user experience, and it suits a supervised kiosk, but it does **not** verify identity.

What is protected anyway:
* Admin functions need the admin **PIN** (bcrypt-hashed, locked for 15 minutes after 5 wrong tries) **plus** the admin role checked in the database. Hiding buttons is not relied on.
* Employees can only see aggregate counts for other people, never names or reasons.
* There are no secrets in the frontend, and every action is validated in the database and audited.

What you should add before production (choose what fits):
1. **Restrict the network:** serve the app only on the factory LAN/VPN, or put it behind Cloudflare Access or an IP allow-list.
2. **A second factor for employees:** a badge/QR scan, a birth-date or national-ID suffix, or a personal PIN. The `login` function already has a `p_pin` parameter you can extend to employees.
3. **Proper admin auth:** move admins to Supabase Auth (email + password + MFA) or company SSO, and check `auth.uid()` in `_require_admin`.
4. **Rate limiting** on `login`, for example through Supabase Edge Functions or Cloudflare. Today there is a per-admin PIN lockout but no global limit on employee-ID guessing.
5. **Use non-sequential Employee IDs** for the login, or add a check digit.
6. **PDPA:** leave reasons can contain personal or health data. Tell employees what is stored, limit admin accounts, and set a retention period.

See `docs/SECURITY.md` for details.

---

## 6. Project structure
```
supabase/migrations/001_schema.sql   tables, indexes, RLS, all server-side logic (RPC)
supabase/setup_admin.sql             create first admin + PIN
supabase/seed.sql                    optional sample employees (no bookings)
supabase/tests/                      DB acceptance tests (incl. concurrency)
tests/e2e/                           Playwright browser test + local proxy
src/lib/api.ts                       typed RPC client (anon key only)
src/lib/session.tsx                  session token, auto-logout after inactivity
src/lib/excel.ts                     .xlsx export, formula-injection protection
src/pages/                           Login, Calendar, Booking modal, My bookings
src/pages/admin/                     Bookings, Special booking, Employees, Audit log
```

## 7. Excel export
* Button: **Export to Excel**, on the admin "การจองทั้งหมด" and "การจองพิเศษ" pages. It exports the rows matching the current filters, re-fetched from the database.
* The `Bookings` sheet has the 14 required columns, a frozen header and an auto-filter.
* The `Report Info` sheet holds the export time, who exported, totals and **all the filters applied**.
* File name: `Leave_Bookings_<from>_to_<to>[_ShiftA][_special][_cancelled].xlsx`.
* Thai text is stored as Unicode. Dates are `yyyy-MM-dd`, and timestamps are `yyyy-MM-dd HH:mm` in Asia/Bangkok time.
* Cells starting with `= + - @` or a tab/CR get an apostrophe prefix, which prevents formula injection.
* **Note on SheetJS:** the npm build `xlsx@0.18.5` is used because the SheetJS CDN was unreachable from the build environment. Its published advisories concern *parsing* untrusted files, which this app never does: it only writes. To use the latest build, run `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.
