import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastKind = 'info' | 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => {
      list.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  const push = useCallback((message: string, kind: ToastKind = 'info') => {
    counter.current += 1;
    const id = counter.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, kind === 'error' ? 7000 : 4200);
    timers.current.push(timer);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div className="toast" data-kind={toast.kind} key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
