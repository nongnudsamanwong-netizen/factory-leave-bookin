import { useCallback, useEffect, useMemo, useState } from 'react';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { Ban, FileSpreadsheet, Pencil, RotateCcw, Search, Star } from 'lucide-react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { errorMessage } from '../../lib/messages';
import { fmtTs, thaiDate } from '../../lib/dates';
import type { Booking, BookingFilters, EmployeeAdmin } from '../../lib/types';
import {
  Alert, Button, ConfirmDialog, EmptyState, Field, Modal, ShiftBadge, Spinner, StatusBadge,
  TypeBadge, cx, inputCls, useToast,
} from '../../components/ui';
import SpecialBookingModal from './SpecialBookingModal';

export default function AdminBookings({ specialOnly = false }: { specialOnly?: boolean }) {
  const { session, today, guard } = useSession();
  const toast = useToast();
  const monthStart = startOfMonth(parseISO(today ?? format(new Date(), 'yyyy-MM-dd')));
  const initial: BookingFilters = {
    from: format(monthStart, 'yyyy-MM-dd'), to: format(endOfMonth(monthStart), 'yyyy-MM-dd'),
    department: '', shift: '', status: '', type: specialOnly ? 'special' : '', search: '',
  };
  const [filters, setFilters] = useState<BookingFilters>(initial);
  const [applied, setApplied] = useState<BookingFilters>(initial);
  const [month, setMonth] = useState(format(monthStart, 'yyyy-MM'));
  const [rows, setRows] = useState<Booking[]>([]);
  const [employees, setEmployees] = useState<EmployeeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSpecial, setShowSpecial] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editTarget, setEditTarget] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department))).sort(), [employees]);

  const load = useCallback(async (f: BookingFilters) => {
    if (!session) return;
    setLoading(true); setError(null);
    try {
      setRows(await guard(api.listBookings(session.token, f)));
      setApplied(f);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [session, guard]);

  useEffect(() => {
    load(initial);
    if (session) guard(api.listEmployees(session.token)).then(setEmployees).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specialOnly]);

  const set = (k: keyof BookingFilters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  function pickMonth(v: string) {
    setMonth(v);
    if (!v) return;
    const s = parseISO(v + '-01');
    setFilters((f) => ({ ...f, from: format(s, 'yyyy-MM-dd'), to: format(endOfMonth(s), 'yyyy-MM-dd') }));
  }

  async function doExport() {
    if (!session) return;
    setExporting(true);
    try {
      // Re-fetch from the server so the file reflects the latest database data
      const fresh = await guard(api.listBookings(session.token, applied));
      if (fresh.length === 0) { toast('error', 'ไม่มีข้อมูลตามตัวกรองนี้'); return; }
      const { exportBookings } = await import('../../lib/excel'); // lazy-load SheetJS
      const name = exportBookings(fresh, applied, `${session.employee.employee_id} - ${session.employee.full_name}`);
      toast('success', `ดาวน์โหลด ${name} แล้ว (${fresh.length} รายการ)`);
    } catch (e) { toast('error', errorMessage(e)); } finally { setExporting(false); }
  }

  async function doCancel() {
    if (!cancelTarget || !session) return;
    setBusy(true);
    try {
      await guard(api.cancelBooking(session.token, cancelTarget.id, cancelReason));
      toast('success', `ยกเลิกการจอง #${cancelTarget.id} แล้ว`);
      setCancelTarget(null); setCancelReason('');
      load(applied);
    } catch (e) { toast('error', errorMessage(e)); } finally { setBusy(false); }
  }

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    special: rows.filter((r) => r.booking_type === 'special').length,
    cancelled: rows.filter((r) => r.status === 'cancelled').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800">{specialOnly ? 'การจองพิเศษ' : 'การจองทั้งหมด'}</h2>
        <div className="flex flex-wrap gap-2">
          <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowSpecial(true)}>
            <Star className="h-5 w-5" /> Add Special Booking
          </Button>
          <Button variant="success" onClick={doExport} loading={exporting} disabled={loading}>
            <FileSpreadsheet className="h-5 w-5" /> Export to Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
      <form className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => { e.preventDefault(); load(filters); }}>
        <Field label="ค้นหา (รหัส / ชื่อพนักงาน)">
          <input className={inputCls} value={filters.search} onChange={(e) => set('search', e.target.value)} placeholder="EMP001 หรือ สมชาย" />
        </Field>
        <Field label="เดือน">
          <input type="month" className={inputCls} value={month} onChange={(e) => pickMonth(e.target.value)} />
        </Field>
        <Field label="ตั้งแต่วันที่">
          <input type="date" className={inputCls} value={filters.from} onChange={(e) => { setMonth(''); set('from', e.target.value); }} />
        </Field>
        <Field label="ถึงวันที่">
          <input type="date" className={inputCls} value={filters.to} onChange={(e) => { setMonth(''); set('to', e.target.value); }} />
        </Field>
        <Field label="แผนก">
          <select className={inputCls} value={filters.department} onChange={(e) => set('department', e.target.value)}>
            <option value="">ทุกแผนก</option>
            {departments.map((d) => <option key={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="กะ">
          <select className={inputCls} value={filters.shift} onChange={(e) => set('shift', e.target.value)}>
            <option value="">ทุกกะ</option><option value="A">กะ A</option><option value="B">กะ B</option>
          </select>
        </Field>
        <Field label="สถานะ">
          <select className={inputCls} value={filters.status} onChange={(e) => set('status', e.target.value)}>
            <option value="">ทั้งหมด</option><option value="active">ใช้งาน</option><option value="cancelled">ยกเลิกแล้ว</option>
          </select>
        </Field>
        <Field label="ประเภทการจอง">
          <select className={inputCls} value={filters.type} disabled={specialOnly} onChange={(e) => set('type', e.target.value)}>
            <option value="">ทั้งหมด</option><option value="normal">ปกติ</option><option value="special">พิเศษ</option>
          </select>
        </Field>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" loading={loading}><Search className="h-5 w-5" /> ค้นหา</Button>
          <Button type="button" variant="secondary" onClick={() => { setFilters(initial); setMonth(initial.from!.slice(0, 7)); load(initial); }}>
            <RotateCcw className="h-5 w-5" /> ล้างตัวกรอง
          </Button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ทั้งหมด" value={stats.total} cls="text-slate-800" />
        <Stat label="ใช้งาน" value={stats.active} cls="text-green-700" />
        <Stat label="การจองพิเศษ" value={stats.special} cls="text-purple-700" />
        <Stat label="ยกเลิกแล้ว" value={stats.cancelled} cls="text-slate-500" />
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading ? <Spinner className="py-16" label="กำลังโหลด..." /> : rows.length === 0 ? (
          <EmptyState title="ไม่พบการจองตามเงื่อนไข" hint="ลองเปลี่ยนตัวกรองหรือช่วงวันที่" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  {['#', 'วันที่ลา', 'พนักงาน', 'แผนก', 'กะ', 'เหตุผล', 'สถานะ', 'ประเภท', 'ผู้อนุมัติ', 'สร้างเมื่อ / โดย', ''].map((h) => (
                    <th key={h} className="px-3 py-3 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((b) => (
                  <tr key={b.id} className={cx(b.status === 'cancelled' && 'bg-slate-50 text-slate-400', b.booking_type === 'special' && b.status === 'active' && 'bg-purple-50/40')}>
                    <td className="px-3 py-3 font-mono">{b.id}</td>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold">{thaiDate(b.leave_date)}</td>
                    <td className="px-3 py-3"><div className="font-semibold">{b.employee_name}</div><div className="font-mono text-xs">{b.employee_code}</div></td>
                    <td className="px-3 py-3">{b.department}</td>
                    <td className="px-3 py-3"><ShiftBadge shift={b.shift} /></td>
                    <td className="max-w-[16rem] px-3 py-3"><p className="line-clamp-3 break-words" title={b.leave_reason}>{b.leave_reason}</p>
                      {b.cancel_reason && <p className="text-xs text-red-500">ยกเลิก: {b.cancel_reason}</p>}</td>
                    <td className="px-3 py-3"><StatusBadge status={b.status} /></td>
                    <td className="px-3 py-3"><TypeBadge type={b.booking_type} /></td>
                    <td className="px-3 py-3 text-xs">{b.approved_by && <><div className="font-semibold">{b.approved_by}</div><div>{fmtTs(b.approved_at)}</div>{b.approval_note && <div className="italic">{b.approval_note}</div>}</>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs">{fmtTs(b.created_at)}<div>{b.created_by_code}</div></td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {b.status === 'active' && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => setEditTarget(b)} aria-label="แก้ไข"><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setCancelTarget(b)} aria-label="ยกเลิก"><Ban className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSpecial && (
        <SpecialBookingModal employees={employees} onClose={() => setShowSpecial(false)}
                             onSaved={(m) => { setShowSpecial(false); toast('success', m); load(applied); }} />
      )}

      <ConfirmDialog open={!!cancelTarget} title="ยกเลิกการจอง" danger confirmText="ยืนยันการยกเลิก" loading={busy}
        onConfirm={doCancel} onClose={() => setCancelTarget(null)}
        message={cancelTarget && <p>ยกเลิกการจอง #{cancelTarget.id} ของ <b>{cancelTarget.employee_name}</b> วันที่ <b>{thaiDate(cancelTarget.leave_date)}</b>?
          <br /><span className="text-sm text-slate-500">ประวัติการจองจะยังคงอยู่ในรายงาน</span></p>}>
        <Field label="เหตุผลการยกเลิก">
          <input className={inputCls} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} maxLength={200} />
        </Field>
      </ConfirmDialog>

      {editTarget && <EditBookingModal booking={editTarget} onClose={() => setEditTarget(null)}
                       onSaved={() => { setEditTarget(null); toast('success', 'แก้ไขการจองแล้ว'); load(applied); }} />}
    </div>
  );
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={cx('text-3xl font-bold', cls)}>{value}</div>
    </div>
  );
}

function EditBookingModal({ booking, onClose, onSaved }: { booking: Booking; onClose: () => void; onSaved: () => void }) {
  const { session, guard } = useSession();
  const [date, setDate] = useState(booking.leave_date);
  const [reason, setReason] = useState(booking.leave_reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setBusy(true); setError(null);
    try { await guard(api.updateBooking(session!.token, booking.id, date, reason)); onSaved(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`แก้ไขการจอง #${booking.id}`}
           footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>บันทึก</Button></>}>
      <div className="space-y-4">
        <p className="text-slate-600">{booking.employee_code} · {booking.employee_name} · <ShiftBadge shift={booking.shift} /> · <TypeBadge type={booking.booking_type} /></p>
        <Field label="วันที่ลา" hint={booking.booking_type === 'normal' ? 'ถ้าเปลี่ยนวัน ระบบจะตรวจสอบโควตาของวันใหม่' : undefined}>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="เหตุผลการลา">
          <textarea className={inputCls + ' min-h-[90px]'} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
