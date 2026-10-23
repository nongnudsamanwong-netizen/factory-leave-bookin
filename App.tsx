import { useState } from 'react';
import { CalendarDays, ClipboardList, History, LogOut, Menu, Star, Users, X } from 'lucide-react';
import { useSession } from './lib/session';
import { Button, ShiftBadge, Spinner, cx } from './components/ui';
import LoginPage from './pages/LoginPage';
import CalendarPage from './pages/CalendarPage';
import AdminBookings from './pages/admin/AdminBookings';
import AdminEmployees from './pages/admin/AdminEmployees';
import AdminAudit from './pages/admin/AdminAudit';

type View = 'calendar' | 'bookings' | 'special' | 'employees' | 'audit';

const NAV: { id: View; label: string; icon: typeof CalendarDays; admin?: boolean }[] = [
  { id: 'calendar', label: 'ปฏิทินวันลา', icon: CalendarDays },
  { id: 'bookings', label: 'การจองทั้งหมด', icon: ClipboardList, admin: true },
  { id: 'special', label: 'การจองพิเศษ', icon: Star, admin: true },
  { id: 'employees', label: 'จัดการพนักงาน', icon: Users, admin: true },
  { id: 'audit', label: 'ประวัติการแก้ไข', icon: History, admin: true },
];

export default function App() {
  const { session, restoring, logout } = useSession();
  const [view, setView] = useState<View>('calendar');
  const [menuOpen, setMenuOpen] = useState(false);

  if (restoring) return <Spinner className="min-h-screen" label="กำลังโหลด..." />;
  if (!session) return <LoginPage />;

  const e = session.employee;
  // UI only shows admin menus for admin sessions. Real protection is server-side:
  // every admin_* function re-checks the role and PIN-verified session.
  const nav = NAV.filter((n) => !n.admin || session.isAdmin);
  const current = nav.some((n) => n.id === view) ? view : 'calendar';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 bg-blue-700 text-white shadow">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          {session.isAdmin && (
            <button className="rounded-lg p-1.5 hover:bg-blue-600 lg:hidden" onClick={() => setMenuOpen((v) => !v)} aria-label="เมนู">
              {menuOpen ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
            </button>
          )}
          <CalendarDays className="h-8 w-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold sm:text-xl">ระบบจองวันลาพักร้อน</h1>
            <p className="hidden text-xs text-blue-100 sm:block">Factory Leave Booking System</p>
          </div>
          <div className="hidden text-right sm:block">
            <div className="font-semibold">{e.full_name}</div>
            <div className="text-xs text-blue-100">{e.employee_id} · {e.department}{session.isAdmin && ' · ผู้ดูแลระบบ'}</div>
          </div>
          <span className="rounded-lg bg-white px-1 py-0.5"><ShiftBadge shift={e.shift} /></span>
          <Button variant="ghost" className="text-white hover:bg-blue-600" onClick={() => logout()}>
            <LogOut className="h-5 w-5" /> <span className="hidden sm:inline">ออกจากระบบ</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-3 py-5 sm:px-4">
        {session.isAdmin && (
          <aside className={cx(
            'fixed inset-y-0 left-0 z-30 w-64 bg-white pt-20 shadow-xl transition-transform lg:static lg:z-0 lg:block lg:translate-x-0 lg:rounded-2xl lg:pt-3 lg:shadow-sm',
            'h-full lg:h-fit', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
            <nav className="space-y-1 p-3">
              {nav.map((n) => (
                <button key={n.id} onClick={() => { setView(n.id); setMenuOpen(false); }}
                        className={cx('flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-semibold',
                          current === n.id ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-blue-50')}>
                  <n.icon className="h-5 w-5" /> {n.label}
                </button>
              ))}
            </nav>
          </aside>
        )}
        {menuOpen && <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} />}
        <main className="min-w-0 flex-1">
          <div className="mb-4 sm:hidden">
            <div className="font-semibold text-slate-800">{e.full_name}</div>
            <div className="text-sm text-slate-500">{e.employee_id} · {e.department}</div>
          </div>
          {current === 'calendar' && <CalendarPage />}
          {current === 'bookings' && <AdminBookings key="all" />}
          {current === 'special' && <AdminBookings key="special" specialOnly />}
          {current === 'employees' && <AdminEmployees />}
          {current === 'audit' && <AdminAudit />}
        </main>
      </div>
    </div>
  );
}
