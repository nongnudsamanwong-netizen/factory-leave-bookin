import { format, parseISO } from 'date-fns';

export const TZ = 'Asia/Bangkok';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/** yyyy-MM-dd for a local calendar Date */
export const ymd = (d: Date) => format(d, 'yyyy-MM-dd');

/** "16 พฤศจิกายน 2569" (Buddhist year) */
export function thaiDate(iso: string, withWeekday = false): string {
  const d = parseISO(iso);
  const s = `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
  return withWeekday ? `วัน${THAI_WEEKDAYS[d.getDay()]}ที่ ${s}` : s;
}

export const thaiMonthYear = (d: Date) => `${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;

/** Timestamp -> "2026-11-16 08:30" in factory time zone (used in UI and Excel) */
export function fmtTs(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')} ${g('hour') === '24' ? '00' : g('hour')}:${g('minute')}`;
}

/** Current date-time in Bangkok as value for <input type="datetime-local"> */
export function nowLocalInput(): string {
  return fmtTs(new Date().toISOString()).replace(' ', 'T');
}

/** datetime-local value (Bangkok wall clock) -> ISO with +07:00 offset */
export const localInputToIso = (v: string) => `${v}:00+07:00`;
