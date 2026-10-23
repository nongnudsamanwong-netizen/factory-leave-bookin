import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import type { Session } from './types';

const KEY = 'flb_session_token';

interface Ctx {
  session: Session | null;
  today: string | null;
  quota: number;
  restoring: boolean;
  setSession: (s: Session) => void;
  logout: (reason?: string) => void;
  logoutReason: string | null;
  /** Wrap API calls: logs out automatically when the server says UNAUTHORIZED */
  guard: <T>(p: Promise<T>) => Promise<T>;
}

const SessionCtx = createContext<Ctx | null>(null);

function readToken() {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}
function writeToken(t: string | null) {
  try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [quota, setQuota] = useState(2);
  const [restoring, setRestoring] = useState(true);
  const [logoutReason, setLogoutReason] = useState<string | null>(null);

  const refreshMe = useCallback(async (token: string) => {
    const me = await api.me(token);
    setSessionState({ token, employee: me.employee, isAdmin: me.is_admin });
    setToday(me.today);
    setQuota(me.quota);
  }, []);

  useEffect(() => {
    const t = readToken();
    if (!t) { setRestoring(false); return; }
    refreshMe(t).catch(() => writeToken(null)).finally(() => setRestoring(false));
  }, [refreshMe]);

  const setSession = useCallback((s: Session) => {
    writeToken(s.token);
    setLogoutReason(null);
    setSessionState(s);
    refreshMe(s.token).catch(() => undefined);
  }, [refreshMe]);

  const logout = useCallback((reason?: string) => {
    setSessionState((cur) => {
      if (cur) api.logout(cur.token).catch(() => undefined);
      return null;
    });
    writeToken(null);
    setLogoutReason(reason ?? null);
  }, []);

  const guard = useCallback(<T,>(p: Promise<T>) =>
    p.catch((e) => {
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') logout('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
      throw e;
    }), [logout]);

  // Auto-logout after inactivity (shared factory kiosks)
  useEffect(() => {
    if (!session) return;
    const minutes = Number(import.meta.env.VITE_IDLE_LOGOUT_MINUTES ?? 5) || 5;
    const limit = (session.isAdmin ? Math.max(minutes, 15) : minutes) * 60_000;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const evts = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    evts.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = window.setInterval(() => {
      if (Date.now() - last > limit) logout('ออกจากระบบอัตโนมัติเนื่องจากไม่มีการใช้งาน');
    }, 15_000);
    return () => { evts.forEach((e) => window.removeEventListener(e, bump)); clearInterval(iv); };
  }, [session, logout]);

  return (
    <SessionCtx.Provider value={{ session, today, quota, restoring, setSession, logout, logoutReason, guard }}>
      {children}
    </SessionCtx.Provider>
  );
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSession outside provider');
  return c;
}
