import { useRef, useState } from 'react';
import { CalendarDays, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { api, ApiError, isConfigured } from '../lib/api';
import { errorMessage } from '../lib/messages';
import { useSession } from '../lib/session';
import { Alert, Button, inputCls } from '../components/ui';

export default function LoginPage() {
  const { setSession, logoutReason } = useSession();
  const [employeeId, setEmployeeId] = useState('');
  const [pin, setPin] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = employeeId.trim();
    if (!id) { setError('กรุณากรอกรหัสพนักงาน'); return; }
    setLoading(true); setError(null);
    try {
      const r = await api.login(id, needPin ? pin : undefined);
      if (r.status === 'pin_required') {
        setNeedPin(true);
        setTimeout(() => pinRef.current?.focus(), 50);
      } else if (r.status === 'pin_invalid') {
        setError('รหัส PIN ผู้ดูแลไม่ถูกต้อง');
        setPin('');
      } else if (r.status === 'ok') {
        setSession({ token: r.token, employee: r.employee, isAdmin: r.is_admin });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
            <CalendarDays className="h-11 w-11" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ระบบจองวันลาพักร้อน</h1>
          <p className="mt-1 text-slate-500">Factory Leave Booking System</p>
        </div>

        {!isConfigured && (
          <div className="mb-4"><Alert kind="error">{errorMessage(new ApiError('NOT_CONFIGURED'))}</Alert></div>
        )}
        {logoutReason && !error && <div className="mb-4"><Alert kind="info">{logoutReason}</Alert></div>}

        <form onSubmit={submit} className="space-y-5" noValidate>
          <label className="block">
            <span className="mb-2 block text-lg font-semibold text-slate-700">รหัสพนักงาน</span>
            <input
              className={inputCls + ' py-4 text-center text-2xl font-bold uppercase tracking-widest'}
              value={employeeId}
              onChange={(e) => { setEmployeeId(e.target.value); setNeedPin(false); setPin(''); setError(null); }}
              placeholder="เช่น EMP001"
              autoFocus autoComplete="off" inputMode="text" maxLength={30}
              aria-label="รหัสพนักงาน"
            />
          </label>

          {needPin && (
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-700">
                <ShieldCheck className="h-5 w-5 text-blue-600" /> รหัส PIN ผู้ดูแลระบบ
              </span>
              <input ref={pinRef} type="password" inputMode="numeric" autoComplete="off"
                     className={inputCls + ' py-4 text-center text-2xl tracking-[0.5em]'}
                     value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                     maxLength={12} aria-label="รหัส PIN ผู้ดูแลระบบ" />
              <span className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <KeyRound className="h-4 w-4" /> เฉพาะบัญชีผู้ดูแลระบบเท่านั้นที่ต้องใส่ PIN
              </span>
            </label>
          )}

          {error && <Alert kind="error">{error}</Alert>}

          <Button type="submit" size="lg" className="w-full" loading={loading}>
            <LogIn className="h-6 w-6" /> Login
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-slate-400">กรอกรหัสพนักงานแล้วกด Login</p>
      </div>
    </div>
  );
}
