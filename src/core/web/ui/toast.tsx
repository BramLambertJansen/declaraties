import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';

// Toast: korte terugkoppeling na een actie ("gelukt" of "fout"). Context zonder globale store: ToastProvider staat in de
// app-root, de AppShell rendert de Toaster. Succes is een beleefde statusmelding (role=status, polite), een fout wordt
// direct voorgelezen (role=alert, assertive). Beide regio's staan altijd in de DOM, anders pakt een schermlezer de
// eerste melding niet op.
type ToastTone = 'success' | 'error';

interface ToastItem {
  readonly id: number;
  readonly tone: ToastTone;
  readonly message: string;
}

interface ToastApi {
  readonly success: (message: string) => void;
  readonly error: (message: string) => void;
}

interface ToastState {
  readonly toasts: readonly ToastItem[];
  readonly dismiss: (id: number) => void;
}

const MAX_TOASTS = 3;
const SUCCESS_MS = 5000;
const ERROR_MS = 8000;

const ToastApiContext = createContext<ToastApi | null>(null);
// Zonder provider is de lijst leeg, zodat een AppShell in een test of storybook-achtige opzet niet breekt; alleen useToast gooit.
const ToastStateContext = createContext<ToastState>({ toasts: [], dismiss: () => undefined });

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const add = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }].slice(-MAX_TOASTS));
      timers.current.set(
        id,
        setTimeout(
          () => {
            dismiss(id);
          },
          tone === 'success' ? SUCCESS_MS : ERROR_MS,
        ),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => {
        add('success', message);
      },
      error: (message) => {
        add('error', message);
      },
    }),
    [add],
  );
  const state = useMemo<ToastState>(() => ({ toasts, dismiss }), [toasts, dismiss]);

  return (
    <ToastApiContext.Provider value={api}>
      <ToastStateContext.Provider value={state}>{children}</ToastStateContext.Provider>
    </ToastApiContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastApiContext);
  if (api === null) throw new Error('useToast moet binnen een ToastProvider worden gebruikt');
  return api;
}

function ToastCard({ toast, onClose }: { readonly toast: ToastItem; readonly onClose: (id: number) => void }) {
  const isError = toast.tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={
        isError
          ? 'pointer-events-auto flex items-start gap-2 rounded-md border border-destructive bg-background px-3 py-2 text-sm font-medium text-destructive shadow-md'
          : 'pointer-events-auto flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-md'
      }
    >
      <span className="min-w-0 flex-1 self-center break-words">{toast.message}</span>
      <Button
        variant="ghost"
        size="icon"
        aria-label={uiTexts.close}
        onClick={() => {
          onClose(toast.id);
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useContext(ToastStateContext);
  const successes = toasts.filter((toast) => toast.tone === 'success');
  const errors = toasts.filter((toast) => toast.tone === 'error');
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:start-auto sm:w-96">
      <div aria-live="polite" className="flex w-full flex-col gap-2">
        {successes.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={dismiss} />
        ))}
      </div>
      <div aria-live="assertive" className="flex w-full flex-col gap-2">
        {errors.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onClose={dismiss} />
        ))}
      </div>
    </div>
  );
}
