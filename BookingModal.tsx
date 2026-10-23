import { useState } from 'react';
import { Save, PhoneCall } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { errorMessage, QUOTA_FULL_MESSAGE } from '../lib/messages';
import { thaiDate } from '../lib/dates';
import { Alert, Button, Modal, ShiftBadge, cx, inputCls } from '../components/ui';

export default function BookingModal({
  date, counts, alreadyBooked, past, onClose, onSaved, onConflict,
}: {
  date: string;
  counts: { A: number; B: number };
  alreadyBooked: boolean;
  past: boolean;
  onClose: () => void;
  onSaved: () => void;
  onConflict: () => void;
}) {
  const { session, quota, guard } = useSession();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaFull, setQuotaFull] = useState(false);
  if (!session) return null;
  const e = session.employee;
  const myCount = counts[e.shift];
  const full = myCount >= quota || quotaFull;
  const canBook = !past && !full && !alreadyBooked;

  async function save() {
    if (!reason.trim()) { setError('กรุณากรอกเหตุผลการลา'); return; }
    setSaving(true); setError(null);
    try {
      await guard(api.bookLeave(session!.token, date, reason.trim()));
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'QUOTA_FULL') {
        setQuotaFull(true);        // someone took the last slot meanwhile
        onConflict();
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open onClose={onClose}
      title="จองวันลาพักร้อน"
      footer={<>
        <Button variant="secondary" size="lg" onClick={onClose} disabled={saving}>Cancel</Button>
        {canBook && (
          <Button variant="success" size="lg" onClick={save} loading={saving}>
            <Save className="h-5 w-5" /> Save Booking
          </Button>
        )}
      </>}
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-blue-50 p-4 text-center">
          <div className="text-sm text-blue-700">วันที่ลา</div>
          <div className="text-2xl font-bold text-blue-900">{thaiDate(date, true)}</div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-base">
          <Info label="รหัสพนักงาน" value={e.employee_id} />
          <Info label="ชื่อ-นามสกุล" value={e.full_name} />
          <Info label="แผนก" value={e.department} />
          <div><dt className="text-sm text-slate-500">กะ</dt><dd className="mt-0.5"><ShiftBadge shift={e.shift} /></dd></div>
        </dl>

        <div className={cx('flex items-center justify-between rounded-xl border-2 p-3',
          full ? 'border-red-300 bg-red-50' : e.shift === 'A' ? 'border-shiftA-light bg-blue-50/50' : 'border-shiftB-light bg-orange-50/50')}>
          <span className="font-semibold text-slate-700">จำนวนผู้จองกะ {e.shift} วันนี้</span>
          <span className={cx('text-2xl font-bold', full ? 'text-red-600' : e.shift === 'A' ? 'text-shiftA' : 'text-shiftB')}>
            {quotaFull ? `${quota}/${quota}` : `${myCount}/${quota}`} คน
          </span>
        </div>

        {past && <Alert kind="warning">วันนี้ผ่านมาแล้ว ไม่สามารถจองวันลาได้</Alert>}
        {!past && alreadyBooked && <Alert kind="success">คุณได้จองวันลาวันนี้ไว้แล้ว</Alert>}
        {!past && !alreadyBooked && full && (
          <Alert kind="error">
            <p className="font-bold">{QUOTA_FULL_MESSAGE}</p>
            <p className="mt-2 flex items-center gap-1.5 text-sm"><PhoneCall className="h-4 w-4" />
              ผู้ดูแลระบบจะเพิ่มการจองพิเศษให้หลังจากหัวหน้างานอนุมัติแล้ว</p>
          </Alert>
        )}

        {canBook && (
          <label className="block">
            <span className="mb-1 block text-base font-semibold text-slate-700">Leave Reason / เหตุผลการลา <span className="text-red-500">*</span></span>
            <textarea className={inputCls + ' min-h-[110px]'} value={reason} maxLength={500}
                      onChange={(ev) => { setReason(ev.target.value); setError(null); }}
                      placeholder="เช่น ธุระส่วนตัว พาครอบครัวไปต่างจังหวัด" autoFocus />
            <span className="mt-1 block text-right text-xs text-slate-400">{reason.length}/500</span>
          </label>
        )}
        {error && <Alert kind="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="truncate font-semibold text-slate-800">{value}</dd>
    </div>
  );
}
