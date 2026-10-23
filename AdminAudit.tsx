import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { errorMessage } from '../../lib/messages';
import { fmtTs } from '../../lib/dates';
import type { AuditLog } from '../../lib/types';
import { Alert, Button, EmptyState, Spinner, cx } from '../../components/ui';

const ACTION_LABEL: Record<string, [string, string]> = {
  booking_created: ['จองวันลา', 'bg-green-100 text-green-800'],
  booking_cancelled_by_employee: ['พนักงานยกเลิก', 'bg-slate-200 text-slate-700'],
  booking_cancelled_by_admin: ['ผู้ดูแลยกเลิก', 'bg-red-100 text-red-800'],
  booking_updated_by_admin: ['ผู้ดูแลแก้ไขการจอง', 'bg-amber-100 text-amber-800'],
  special_booking_created: ['การจองพิเศษ', 'bg-purple-100 text-purple-800'],
  employee_created: ['เพิ่มพนักงาน', 'bg-blue-100 text-blue-800'],
  employee_updated: ['แก้ไขพนักงาน', 'bg-blue-100 text-blue-800'],
  employee_role_changed: ['เปลี่ยนสิทธิ์', 'bg-red-100 text-red-800'],
  admin_pin_set: ['ตั้ง PIN', 'bg-slate-200 text-slate-700'],
  admin_login: ['ผู้ดูแลเข้าสู่ระบบ', 'bg-slate-100 text-slate-600'],
  admin_login_failed: ['PIN ผิด', 'bg-red-100 text-red-800'],
};

export default function AdminAudit() {
  const { session, guard } = useSession();
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError(null);
    try { setRows(await guard(api.auditLogs(session.token, 300))); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [session, guard]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">ประวัติการแก้ไข (Audit Log)</h2>
        <Button variant="secondary" onClick={load} loading={loading}><RefreshCw className="h-5 w-5" /> รีเฟรช</Button>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading ? <Spinner className="py-16" /> : rows.length === 0 ? <EmptyState title="ยังไม่มีประวัติ" /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const [label, cls] = ACTION_LABEL[r.action] ?? [r.action, 'bg-slate-100 text-slate-700'];
              return (
                <li key={r.id} className="px-4 py-3">
                  <button className="flex w-full flex-wrap items-center gap-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <span className="w-36 font-mono text-sm text-slate-500">{fmtTs(r.created_at)}</span>
                    <span className={cx('rounded-md px-2 py-0.5 text-sm font-semibold', cls)}>{label}</span>
                    <span className="text-sm text-slate-700">โดย <b>{r.actor_code ?? '-'}</b> {r.actor_name}</span>
                    {r.affected_record_id && <span className="font-mono text-xs text-slate-400">#{r.affected_record_id.slice(0, 8)}</span>}
                  </button>
                  {open === r.id && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">ก่อน: {JSON.stringify(r.previous_values, null, 1)}</pre>
                      <pre className="overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">หลัง: {JSON.stringify(r.new_values, null, 1)}</pre>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
