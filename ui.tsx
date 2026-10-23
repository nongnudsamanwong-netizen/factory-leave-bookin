import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, Loader2, X, XCircle } from 'lucide-react';
import type { BookingStatus, BookingType, Shift } from '../lib/types';
import { SHIFT_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/messages';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 text-slate-500', className)} role="status">
      <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      {label && <span className="text-base">{label}</span>}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'warning';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-400',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus-visible:ring-slate-300',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400',
  success: 'bg-green-600 text-white hover:bg-green-700 focus-visible:ring-green-400',
  warning: 'bg-orange-500 text-white hover:bg-orange-600 focus-visible:ring-orange-300',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300',
};

export function Button({
  variant = 'primary', loading, className, children, size = 'md', ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-base',
        size === 'lg' && 'px-6 py-3.5 text-lg',
        BTN[variant], className,
      )}
    >
      {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      {children}
    </button>
  );
}

export function Modal({
  open, onClose, title, children, footer, wide,
}: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode;
  footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
         onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true"
           className={cx('flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
                         wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-xl font-bold text-slate-800">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="ปิด">
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'warning' | 'info'; children: ReactNode }) {
  const s = {
    error: 'border-red-300 bg-red-50 text-red-800',
    success: 'border-green-300 bg-green-50 text-green-800',
    warning: 'border-orange-300 bg-orange-50 text-orange-900',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }[kind];
  const Icon = kind === 'success' ? CheckCircle2 : kind === 'error' ? XCircle : AlertTriangle;
  return (
    <div className={cx('flex gap-3 rounded-xl border p-4 text-base', s)} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center text-slate-500">
      <Inbox className="h-12 w-12 text-slate-300" />
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="text-sm">{hint}</p>}
    </div>
  );
}

export function ShiftBadge({ shift }: { shift: Shift }) {
  return (
    <span className={cx('inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-bold',
      shift === 'A' ? 'bg-shiftA-light text-shiftA-dark' : 'bg-shiftB-light text-shiftB-dark')}>
      {SHIFT_LABEL[shift]}
    </span>
  );
}
export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={cx('inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold',
      status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600 line-through')}>
      {STATUS_LABEL[status]}
    </span>
  );
}
export function TypeBadge({ type }: { type: BookingType }) {
  return (
    <span className={cx('inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-sm font-semibold',
      type === 'special' ? 'bg-purple-100 text-purple-800 ring-1 ring-purple-300' : 'bg-slate-100 text-slate-600')}>
      {TYPE_LABEL[type]}
    </span>
  );
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; kind: 'success' | 'error'; text: string };
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, kind, text }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id}
               className={cx('pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-white shadow-lg',
                             t.kind === 'success' ? 'bg-green-600' : 'bg-red-600')}>
            {t.kind === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------------- Confirm dialog ---------------- */
export function ConfirmDialog({
  open, title, message, confirmText = 'ยืนยัน', danger, loading, onConfirm, onClose, children,
}: {
  open: boolean; title: string; message: ReactNode; confirmText?: string; danger?: boolean;
  loading?: boolean; onConfirm: () => void; onClose: () => void; children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
           footer={<>
             <Button variant="secondary" onClick={onClose} disabled={loading}>ยกเลิก</Button>
             <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmText}</Button>
           </>}>
      <div className="space-y-3 text-base text-slate-700">{message}{children}</div>
    </Modal>
  );
}
