import { useMemo, useState } from 'react';
import { ShieldAlert, Star } from 'lucide-react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { errorMessage } from '../../lib/messages';
import { localInputToIso, nowLocalInput, thaiDate } from '../../lib/dates';
import type { EmployeeAdmin } from '../../lib/types';
import { Alert, Button, ConfirmDialog, Field, Modal, ShiftBadge, inputCls } from '../../components/ui';

export default function SpecialBookingModal({ employees, onClose, onSaved }: {
  employees: EmployeeAdmin[]; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const { session, today, quota, guard } = useSession();
  const [empQuery, setEmpQuery] = useState('');
  const [empRef, setEmpRef] = useState('');
  const [date, setDate] = useState(today ?? '');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [approvedAt, setApprovedAt] = useState(nowLocalInput());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slot, setSlot] = useState<number | null>(null);

  const active = employees.filter((e) => e.is_active);
  const filtered = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    return q ? active.filter((e) => e.employee_id.toLowerCase().includes(q) || e.full_name.toLowerCase().includes(q)) : active;
  }, [empQuery, active]);
  const emp = active.find((e) => e.id === empRef);

  async function review() {
    setError(null);
    if (!emp) return setError('กรุณาเลือกพนักงาน');
    if (!date) return setError('กรุณาเลือกวันที่ลา');
    if (!reason.trim()) return setError('กรุณากรอกเหตุผลการลา');
    if (!approvedBy.trim()) return setError('กรุณาระบุชื่อหรือรหัสของหัวหน้าที่อนุมัติ');
    if (!approvedAt) return setError('กรุณาระบุวันและเวลาที่อนุมัติ');
    try {
      const c = await guard(api.calendarCounts(session!.token, date, date));
      setSlot(c.find((x) => x.shift === emp.shift)?.count ?? 0);
    } catch { setSlot(null); }
    setConfirm(true);
  }

  async function save() {
    setSaving(true);
    try {
      const r = await guard(api.specialBooking(session!.token, {
        employeeRef: empRef, date, reason: reason.trim(), approvedBy: approvedBy.trim(),
        approvedAt: localInputToIso(approvedAt), note: note.trim(),
      }));
      onSaved(`บันทึกการจองพิเศษ #${r.id} แล้ว (กะ ${r.shift} มีผู้ลา ${r.shift_count} คน)`);
    } catch (e) {
      setConfirm(false);
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} wide
           title={<span className="flex items-center gap-2"><Star className="h-6 w-6 text-purple-600" /> Add Special Booking</span>}
           footer={<>
             <Button variant="secondary" onClick={onClose}>Cancel</Button>
             <Button variant="primary" className="bg-purple-600 hover:bg-purple-700" onClick={review}>ตรวจสอบและยืนยัน</Button>
           </>}>
      <div className="space-y-4">
        <Alert kind="warning">
          ใช้สำหรับกรณีที่โควตาเต็มแล้ว และ<b>หัวหน้างานอนุมัติเป็นกรณีพิเศษแล้วเท่านั้น</b> รายการนี้จะถูกบันทึกเป็น “การจองพิเศษ” และบันทึกในประวัติการแก้ไข
        </Alert>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="ค้นหาพนักงาน (รหัส / ชื่อ)">
            <input className={inputCls} value={empQuery} onChange={(e) => setEmpQuery(e.target.value)} placeholder="พิมพ์เพื่อค้นหา" />
          </Field>
          <Field label="เลือกพนักงาน *">
            <select className={inputCls} value={empRef} onChange={(e) => setEmpRef(e.target.value)}>
              <option value="">— เลือก ({filtered.length}) —</option>
              {filtered.map((e) => <option key={e.id} value={e.id}>{e.employee_id} · {e.full_name}</option>)}
            </select>
          </Field>
        </div>

        {emp && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3">
            <span className="font-semibold">{emp.full_name}</span>
            <span className="text-slate-500">{emp.department}</span>
            <ShiftBadge shift={emp.shift} />
            <span className="text-sm text-slate-500">(กะตามข้อมูลพนักงาน — ไม่สามารถเปลี่ยนได้ที่นี่)</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="วันที่ลา *">
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="วันและเวลาที่อนุมัติ *">
            <input type="datetime-local" className={inputCls} value={approvedAt} onChange={(e) => setApprovedAt(e.target.value)} />
          </Field>
        </div>
        <Field label="ผู้อนุมัติ (ชื่อหรือรหัสหัวหน้างาน) *">
          <input className={inputCls} value={approvedBy} maxLength={120} onChange={(e) => setApprovedBy(e.target.value)} placeholder="เช่น SUP01 สมศักดิ์ หัวหน้ากะ A" />
        </Field>
        <Field label="Leave Reason / เหตุผลการลา *">
          <textarea className={inputCls + ' min-h-[80px]'} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Field label="หมายเหตุการอนุมัติ (ไม่บังคับ)">
          <textarea className={inputCls + ' min-h-[60px]'} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
      </div>

      <ConfirmDialog
        open={confirm} title="ยืนยันการจองพิเศษ" confirmText="ยืนยันการจองพิเศษ" loading={saving}
        onConfirm={save} onClose={() => setConfirm(false)}
        message={emp && (
          <div className="space-y-2">
            <p><ShieldAlert className="mr-1 inline h-5 w-5 text-purple-600" />
              เพิ่มการจองพิเศษให้ <b>{emp.employee_id} {emp.full_name}</b> (กะ {emp.shift})</p>
            <p>วันที่ลา: <b>{date && thaiDate(date, true)}</b></p>
            <p>ผู้อนุมัติ: <b>{approvedBy}</b></p>
            {slot !== null && <p>ปัจจุบันกะ {emp.shift} มีผู้จองแล้ว <b className={slot >= quota ? 'text-red-600' : ''}>{slot}</b> คน → หลังบันทึก <b>{slot + 1}</b> คน</p>}
          </div>
        )}
      />
    </Modal>
  );
}
