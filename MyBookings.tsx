import { useState } from 'react';
import { ListChecks, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { errorMessage } from '../lib/messages';
import { fmtTs, thaiDate } from '../lib/dates';
import type { Booking } from '../lib/types';
import { Button, ConfirmDialog, EmptyState, StatusBadge, TypeBadge, useToast } from '../components/ui';

export default function MyBookings({ bookings, today, onChanged }: {
  bookings: Booking[]; today: string; onChanged: () => void;
}) {
  const { session, guard } = useSession();
  const toast = useToast();
  const [target, setTarget] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!target || !session) return;
    setBusy(true);
    try {
      await guard(api.cancelMyBooking(session.token, target.id));
      toast('success', 'ยกเลิกการจองเรียบร้อยแล้ว');
      setTarget(null);
      onChanged();
    } catch (e) {
      toast('error', errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-800">
        <ListChecks className="h-6 w-6 text-blue-600" /> การจองวันลาของฉัน
      </h3>
      {bookings.length === 0 ? (
        <EmptyState title="ยังไม่มีการจองวันลา" hint="คลิกที่วันในปฏิทินเพื่อจองวันลาพักร้อน" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {bookings.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold text-slate-800">{thaiDate(b.leave_date, true)}</span>
                  <StatusBadge status={b.status} />
                  {b.booking_type === 'special' && <TypeBadge type="special" />}
                </div>
                <p className="break-words text-slate-600">{b.leave_reason}</p>
                <p className="text-xs text-slate-400">จองเมื่อ {fmtTs(b.created_at)}{b.cancel_reason ? ` · ${b.cancel_reason}` : ''}</p>
              </div>
              {b.status === 'active' && b.leave_date >= today && (
                <Button variant="secondary" size="sm" onClick={() => setTarget(b)} className="self-start text-red-600">
                  <Trash2 className="h-4 w-4" /> ยกเลิกการจอง
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!target} title="ยืนยันการยกเลิก" danger confirmText="ยกเลิกการจอง" loading={busy}
        message={target && <>ต้องการยกเลิกการจองวันที่ <b>{thaiDate(target.leave_date)}</b> ใช่หรือไม่?</>}
        onConfirm={cancel} onClose={() => setTarget(null)}
      />
    </section>
  );
}
