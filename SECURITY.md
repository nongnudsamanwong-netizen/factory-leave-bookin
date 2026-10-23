# Security design and production checklist

## Threat model summary
| Threat | Current control | Residual risk |
|---|---|---|
| Employee pretends to be another employee | None beyond knowing the ID (by design) | **High.** Add a second factor or network restriction before production |
| Employee calls admin functions directly | `_require_admin`: DB role = admin **and** session opened with a bcrypt-verified PIN | Low |
| Forged or old tokens | 256-bit random token, only the SHA-256 hash stored, 12h expiry, revoked when role or active status changes | Low |
| Browser manipulates shift, department or employee ID | Ignored: everything is loaded from `employees` via the session | None |
| Over-booking by race condition | `pg_advisory_xact_lock` per (date, shift) + re-count in the same transaction | None (tested with 10 parallel requests) |
| Direct table access with the anon key | RLS forced, no API policies, privileges revoked | None |
| Admin PIN brute force | Locked 15 minutes after 5 failures, failures audited | Low; add network rate limits |
| Employee-ID enumeration | Generic "not found" message | Medium; add rate limiting |
| Formula injection in Excel | Apostrophe prefix on `= + - @ \t \r` | Low |
| XSS | React escapes all output; no `dangerouslySetInnerHTML` | Low |
| Service-role key leak | Not used anywhere | None |

## Before real data: required decisions
1. **Network:** run on the intranet/VPN, or put the app behind Cloudflare Access or Zero Trust.
2. **Employee verification:** pick one of the following.
   * Badge or QR scanner at the kiosk (the badge carries a secret token rather than the plain ID).
   * Personal PIN per employee (extend `login`; the `admin_pin_hash` column pattern can be reused).
   * Company SSO (Azure AD / Google Workspace) through Supabase Auth.
3. **Admins:** move to Supabase Auth with MFA, and change `_require_admin` to also check `auth.uid()` against an `admin_users` table.
4. **Rate limiting:** proxy `rpc/login` through an Edge Function with per-IP limits.
5. **Backups:** enable Point-in-Time Recovery (Supabase Pro) or schedule `pg_dump` exports.
6. **PDPA (Thailand):** add a privacy notice, limit who has admin access, and set a retention period (for example, delete reasons older than 2 years).

## Shared kiosk PCs
* Session tokens are kept in `sessionStorage` and cleared when the tab closes.
* Employees are logged out automatically after `VITE_IDLE_LOGOUT_MINUTES` minutes without activity (default 5; admins get at least 15).
