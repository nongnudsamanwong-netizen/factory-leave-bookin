import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Search, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { errorMessage } from '../../lib/messages';
import type { EmployeeAdmin, Role, Shift } from '../../lib/types';
import {
  Alert, Button, EmptyState, Field, Modal, ShiftBadge, Spinner, cx, inputCls, useToast,
} from '../../components/ui';

type Draft = { id: string | null; employee_id: string; full_name: string; department: string;
               shift: Shift; role: Role; is_active: boolean };
const blank: Draft = { id: null, employee_id: '', full_name: '', department: '', shift: 'A', role: 'employee', is_active: true };

export default function AdminEmployees() {
  const { session, guard } = useSession();
  const toast = useToast();
  const [rows, setRows] = useState<EmployeeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [shift, setShift] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pinFor, setPinFor] = useState<EmployeeAdmin | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError(null);
    try { setRows(await guard(api.listEmployees(session.token))); }
    catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [session, guard]);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => rows.filter((r) =>
    (!q || r.employee_id.toLowerCase().includes(q.toLowerCase()) || r.full_name.toLowerCase().includes(q.toLowerCase())
      || r.department.toLowerCase().includes(q.toLowerCase()))
    && (!shift || r.shift === shift) && (showInactive || r.is_active)), [rows, q, shift, showInactive]);
  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.department))).sort(), [rows]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-800">จัดการพนักงาน</h2>
        <Button onClick={() => setDraft({ ...blank })}><Plus className="h-5 w-5" /> เพิ่มพนักงาน</Button>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <div className="min-w-[14rem] flex-1">
          <Field label="ค้นหา">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
              <input className={inputCls + ' pl-10'} value={q} onChange={(e) => setQ(e.target.value)} placeholder="รหัส ชื่อ หรือแผนก" />
            </div>
          </Field>
        </div>
        <Field label="กะ">
          <select className={inputCls} value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">ทุกกะ</option><option value="A">กะ A</option><option value="B">กะ B</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-3 text-sm font-semibold text-slate-700">
          <input type="checkbox" className="h-5 w-5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          แสดงที่ปิดใช้งาน
        </label>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading ? <Spinner className="py-16" label="กำลังโหลด..." /> : list.length === 0 ? <EmptyState title="ไม่พบพนักงาน" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-100 text-slate-600">
                <tr>{['รหัสพนักงาน', 'ชื่อ-นามสกุล', 'แผนก', 'กะ', 'สิทธิ์', 'สถานะ', ''].map((h) => <th key={h} className="px-3 py-3 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r) => (
                  <tr key={r.id} className={cx(!r.is_active && 'bg-slate-50 text-slate-400')}>
                    <td className="px-3 py-3 font-mono font-semibold">{r.employee_id}</td>
                    <td className="px-3 py-3">{r.full_name}</td>
                    <td className="px-3 py-3">{r.department}</td>
                    <td className="px-3 py-3"><ShiftBadge shift={r.shift} /></td>
                    <td className="px-3 py-3">{r.role === 'admin'
                      ? <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 font-semibold text-blue-800"><ShieldCheck className="h-4 w-4" /> ผู้ดูแล{!r.has_pin && ' (ยังไม่ตั้ง PIN)'}</span>
                      : 'พนักงาน'}</td>
                    <td className="px-3 py-3">{r.is_active
                      ? <span className="rounded-md bg-green-100 px-2 py-0.5 font-semibold text-green-800">ใช้งาน</span>
                      : <span className="rounded-md bg-slate-200 px-2 py-0.5 font-semibold text-slate-600">ปิดใช้งาน</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      {r.role === 'admin' && <Button size="sm" variant="ghost" onClick={() => setPinFor(r)}><KeyRound className="h-4 w-4" /> PIN</Button>}
                      <Button size="sm" variant="ghost" onClick={() => setDraft({ id: r.id, employee_id: r.employee_id, full_name: r.full_name, department: r.department, shift: r.shift, role: r.role, is_active: r.is_active })}>
                        <Pencil className="h-4 w-4" /> แก้ไข
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-sm text-slate-500">ทั้งหมด {rows.length} คน · ใช้งาน {rows.filter((r) => r.is_active).length} คน</p>

      {draft && <EmployeeForm draft={draft} departments={departments} selfId={session!.employee.id}
                  onClose={() => setDraft(null)} onSaved={(m) => { setDraft(null); toast('success', m); load(); }} />}
      {pinFor && <PinForm emp={pinFor} onClose={() => setPinFor(null)} onSaved={() => { setPinFor(null); toast('success', 'ตั้งรหัส PIN เรียบร้อย'); load(); }} />}
    </div>
  );
}

function EmployeeForm({ draft, departments, selfId, onClose, onSaved }: {
  draft: Draft; departments: string[]; selfId: string; onClose: () => void; onSaved: (m: string) => void;
}) {
  const { session, guard } = useSession();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelf = d.id === selfId;
  const roleChanged = draft.id !== null && draft.role !== d.role;
  async function save() {
    setError(null);
    if (!/^[A-Za-z0-9_-]{1,30}$/.test(d.employee_id.trim())) return setError('รหัสพนักงานใช้ได้เฉพาะ A-Z 0-9 - _ (ไม่เกิน 30 ตัว)');
    if (!d.full_name.trim()) return setError('กรุณากรอกชื่อ-นามสกุล');
    if (!d.department.trim()) return setError('กรุณากรอกแผนก');
    if (roleChanged && !window.confirm(`ยืนยันการเปลี่ยนสิทธิ์เป็น "${d.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน'}"?`)) return;
    setBusy(true);
    try {
      await guard(api.saveEmployee(session!.token, { ...d, employee_id: d.employee_id.trim().toUpperCase() }));
      onSaved(d.id ? 'บันทึกข้อมูลพนักงานแล้ว' : 'เพิ่มพนักงานแล้ว');
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={d.id ? 'แก้ไขพนักงาน' : 'เพิ่มพนักงาน'}
           footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>บันทึก</Button></>}>
      <div className="space-y-4">
        <Field label="รหัสพนักงาน *"><input className={inputCls + ' font-mono uppercase'} value={d.employee_id} maxLength={30} onChange={(e) => setD({ ...d, employee_id: e.target.value })} /></Field>
        <Field label="ชื่อ-นามสกุล *"><input className={inputCls} value={d.full_name} maxLength={120} onChange={(e) => setD({ ...d, full_name: e.target.value })} /></Field>
        <Field label="แผนก *">
          <input className={inputCls} list="dept-list" value={d.department} maxLength={80} onChange={(e) => setD({ ...d, department: e.target.value })} />
          <datalist id="dept-list">{departments.map((x) => <option key={x} value={x} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="กะ *">
            <select className={inputCls} value={d.shift} onChange={(e) => setD({ ...d, shift: e.target.value as Shift })}>
              <option value="A">กะ A</option><option value="B">กะ B</option>
            </select>
          </Field>
          <Field label="สิทธิ์ *">
            <select className={inputCls} value={d.role} disabled={isSelf} onChange={(e) => setD({ ...d, role: e.target.value as Role })}>
              <option value="employee">พนักงาน</option><option value="admin">ผู้ดูแลระบบ</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 font-semibold text-slate-700">
          <input type="checkbox" className="h-5 w-5" checked={d.is_active} disabled={isSelf} onChange={(e) => setD({ ...d, is_active: e.target.checked })} />
          เปิดใช้งาน (พนักงานที่ปิดใช้งานจะเข้าสู่ระบบไม่ได้)
        </label>
        {d.role === 'admin' && <Alert kind="info">บัญชีผู้ดูแลระบบต้องตั้งรหัส PIN ก่อนเข้าสู่ระบบ (ปุ่ม “PIN” ในรายการ)</Alert>}
        {draft.id && draft.shift !== d.shift && <Alert kind="warning">การเปลี่ยนกะไม่มีผลกับการจองที่บันทึกไว้แล้ว</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function PinForm({ emp, onClose, onSaved }: { emp: EmployeeAdmin; onClose: () => void; onSaved: () => void }) {
  const { session, guard } = useSession();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    if (!/^\d{6,12}$/.test(pin)) return setError('PIN ต้องเป็นตัวเลข 6–12 หลัก');
    if (pin !== pin2) return setError('PIN ทั้งสองช่องไม่ตรงกัน');
    setBusy(true);
    try { await guard(api.setPin(session!.token, emp.id, pin)); onSaved(); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} title={`ตั้งรหัส PIN: ${emp.employee_id}`}
           footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>บันทึก PIN</Button></>}>
      <div className="space-y-4">
        <Field label="PIN ใหม่ (ตัวเลข 6–12 หลัก)"><input type="password" inputMode="numeric" className={inputCls} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} maxLength={12} /></Field>
        <Field label="ยืนยัน PIN"><input type="password" inputMode="numeric" className={inputCls} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} maxLength={12} /></Field>
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Modal>
  );
}
