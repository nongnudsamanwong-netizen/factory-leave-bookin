import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, parseISO,
  startOfMonth, startOfWeek,
} from 'date-fns';
import { CalendarCheck, ChevronLeft, ChevronRight, RefreshCw, Lock, Star } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { errorMessage } from '../lib/messages';
import { THAI_WEEKDAYS_SHORT, thaiMonthYear, ymd } from '../lib/dates';
import type { Booking, DayCount, Shift } from '../lib/types';
import { Alert, Button, Spinner, cx, useToast } from '../components/ui';
import BookingModal from './BookingModal';
import MyBookings from './MyBookings';

export type CountMap = Record<string, { A: number; B: number; specialA: number; specialB: number }>;

export default function CalendarPage() {
  const { session, today, quota, guard } = useSession();
  const toast = useToast();
  const todayIso = today ?? ymd(new Date());
  const [month, setMonth] = useState(() => startOfMonth(parseISO(todayIso)));
  const [counts, setCounts] = useState<CountMap>({});
  const [mine, setMine] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const gridDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  }), [month]);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError(null);
    try {
      const from = ymd(gridDays[0]);
      const to = ymd(gridDays[gridDays.length - 1]);
      const [rows, my] = await Promise.all([
        guard(api.calendarCounts(session.token, from, to)),
        guard(api.myBookings(session.token)),
      ]);
      const map: CountMap = {};
      for (const r of rows as DayCount[]) {
        const m = (map[r.leave_date] ??= { A: 0, B: 0, specialA: 0, specialB: 0 });
        m[r.shift] = r.count;
        if (r.shift === 'A') m.specialA = r.special_count; else m.specialB = r.special_count;
      }
      setCounts(map);
      setMine(my);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [session, gridDays, guard]);

  useEffect(() => { load(); }, [load]);

  if (!session) return null;
  const myShift = session.employee.shift;
  const myActiveDates = new Set(mine.filter((b) => b.status === 'active').map((b) => b.leave_date));
  const isCurrentMonth = isSameMonth(month, parseISO(todayIso));

  return (
    <div className="space-y-6">
      {/* Header / navigation */}
      <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="เดือนก่อนหน้า">
            <ChevronLeft className="h-6 w-6" /> <span className="hidden sm:inline">เดือนก่อน</span>
          </Button>
          <h2 className="min-w-[11rem] text-center text-2xl font-bold text-slate-800" aria-live="polite">
            {thaiMonthYear(month)}
          </h2>
          <Button variant="secondary" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="เดือนถัดไป">
            <span className="hidden sm:inline">เดือนถัดไป</span> <ChevronRight className="h-6 w-6" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {!isCurrentMonth && (
            <Button variant="primary" onClick={() => setMonth(startOfMonth(parseISO(todayIso)))}>
              <CalendarCheck className="h-5 w-5" /> เดือนปัจจุบัน
            </Button>
          )}
          <Button variant="ghost" onClick={load} aria-label="รีเฟรช" disabled={loading}>
            <RefreshCw className={cx('h-5 w-5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
        <span className="flex items-center gap-1.5"><i className="h-4 w-4 rounded bg-shiftA" /> กะ A</span>
        <span className="flex items-center gap-1.5"><i className="h-4 w-4 rounded bg-shiftB" /> กะ B</span>
        <span className="flex items-center gap-1.5"><i className="h-4 w-4 rounded bg-red-600" /> เต็มแล้ว</span>
        <span className="flex items-center gap-1.5"><Star className="h-4 w-4 fill-green-500 text-green-600" /> วันที่คุณจองไว้</span>
        <span className="flex items-center gap-1.5"><Lock className="h-4 w-4 text-slate-400" /> วันที่ผ่านมาแล้ว</span>
        <span className="ml-auto font-semibold">โควตา {quota} คน / กะ / วัน · คุณอยู่ <b className={myShift === 'A' ? 'text-shiftA' : 'text-shiftB'}>กะ {myShift}</b></span>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {/* Calendar grid */}
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
            <Spinner label="กำลังโหลดข้อมูล..." />
          </div>
        )}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-blue-600 text-center text-sm font-bold text-white sm:text-base">
          {THAI_WEEKDAYS_SHORT.map((d, i) => (
            <div key={d} className={cx('py-2', i === 0 && 'text-red-200')}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const iso = ymd(day);
            const inMonth = isSameMonth(day, month);
            const past = iso < todayIso;
            const c = counts[iso] ?? { A: 0, B: 0, specialA: 0, specialB: 0 };
            const myFull = c[myShift] >= quota;
            const bothFull = c.A >= quota && c.B >= quota;
            const isToday = iso === todayIso;
            const booked = myActiveDates.has(iso);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelected(iso)}
                className={cx(
                  'relative flex min-h-[5.5rem] flex-col items-stretch gap-1 border-b border-r border-slate-100 p-1 text-left transition sm:min-h-[7.5rem] sm:p-2',
                  !inMonth && 'bg-slate-50/70 opacity-40',
                  past ? 'cursor-not-allowed bg-slate-100 text-slate-400' : 'hover:bg-blue-50 focus:z-10 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300',
                  !past && bothFull && 'bg-red-50',
                  !past && !bothFull && myFull && 'bg-red-50/50',
                )}
                aria-label={`${iso} กะ A ${c.A}/${quota} กะ B ${c.B}/${quota}${past ? ' (ผ่านมาแล้ว)' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className={cx('flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold sm:text-base',
                    isToday && 'bg-blue-600 text-white', !isToday && day.getDay() === 0 && 'text-red-500')}>
                    {day.getDate()}
                  </span>
                  {past ? <Lock className="h-3.5 w-3.5" /> : booked && <Star className="h-4 w-4 fill-green-500 text-green-600" />}
                </div>
                <ShiftChip shift="A" count={c.A} quota={quota} special={c.specialA} dim={past} />
                <ShiftChip shift="B" count={c.B} quota={quota} special={c.specialB} dim={past} />
                {!past && bothFull && (
                  <span className="hidden text-center text-[11px] font-bold text-red-600 sm:block">เต็มทั้ง 2 กะ</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <MyBookings bookings={mine} today={todayIso} onChanged={load} />

      {selected && (
        <BookingModal
          date={selected}
          counts={counts[selected] ?? { A: 0, B: 0, specialA: 0, specialB: 0 }}
          alreadyBooked={myActiveDates.has(selected)}
          past={selected < todayIso}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); toast('success', 'บันทึกการจองวันลาเรียบร้อยแล้ว'); load(); }}
          onConflict={load}
        />
      )}
    </div>
  );
}

function ShiftChip({ shift, count, quota, special, dim }: {
  shift: Shift; count: number; quota: number; special: number; dim: boolean;
}) {
  const full = count >= quota;
  return (
    <div className={cx(
      'flex items-center justify-between rounded px-1 py-0.5 text-[11px] font-bold leading-tight sm:px-1.5 sm:text-sm',
      dim ? 'bg-slate-200 text-slate-500'
        : full ? 'bg-red-600 text-white'
        : shift === 'A' ? 'bg-shiftA-light text-shiftA-dark' : 'bg-shiftB-light text-shiftB-dark',
    )}
    title={special ? `รวมการจองพิเศษ ${special} รายการ` : undefined}>
      <span className="flex items-center gap-0.5">
        <i className={cx('hidden h-2 w-2 rounded-full sm:inline-block', shift === 'A' ? 'bg-shiftA' : 'bg-shiftB', full && !dim && 'ring-1 ring-white')} />
        {shift}
      </span>
      <span>{count}/{quota}{special > 0 ? '*' : ''}</span>
    </div>
  );
}
