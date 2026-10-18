import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';

// Toast: korte terugkoppeling na een actie ("gelukt" of "fout"). Context zonder globale store: ToastProvider staat in de
// app-root, de AppShell rendert de Toaster. Succes is een beleefde statusmelding (role=status, polite), een fout wordt
// direct voorgelezen (role=alert, assertive). Beide regio's staan altijd in de DOM, anders pakt een schermlezer de
// eerste melding niet op. Timing (WCAG 2.2.1): een succes verdwijnt na 5 s en pauzeert zolang de muis erboven staat of de focus
// erin; een fout verdwijnt niet vanzelf maar blijft tot de gebruiker hem sluit (of tot het maximum van drie hem verdringt).
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

type HoldKind = 'hover' | 'focus';

interface ToastState {
  readonly toasts: readonly ToastItem[];
  readonly dismiss: (id: number) => void;
  readonly hold: (id: number, kind: HoldKind) => void;
  readonly release: (id: number, kind: HoldKind) => void;
}

const MAX_TOASTS = 3;
const SUCCESS_MS = 5000;

const ToastApiContext = createContext<ToastApi | null>(null);
// Zonder provider is de lijst leeg, zodat een AppShell in een test of storybook-achtige opzet niet breekt; alleen useToast gooit.
const ToastStateContext = createContext<ToastState>({
  toasts: [],
  dismiss: () => undefined,
  hold: () => undefined,
  release: () => undefined,
});

const holdKey = (id: number, kind: HoldKind) => `${String(id)}:${kind}`;

interface Countdown {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

// De aftellers van de succes-toasts. Zolang iets vasthoudt (muis of focus op een toast) staan alle aftellers stil; bij het
// loslaten lopen ze verder met de resterende tijd. `holds` onthoudt per sleutel van welke toast hij is, zodat een toast die
// sluit of door het maximum wegvalt (React stuurt dan geen mouseleave of blur) niemand vasthoudt.
function useCountdowns(remove: (id: number) => void) {
  const countdowns = useRef(new Map<number, Countdown>());
  const holds = useRef(new Map<string, number>());

  const forget = useCallback((id: number) => {
    clearTimeout(countdowns.current.get(id)?.handle ?? undefined);
    countdowns.current.delete(id);
    for (const [key, owner] of holds.current) if (owner === id) holds.current.delete(key);
  }, []);

  const run = useCallback(
    (id: number, countdown: Countdown) => {
      countdown.startedAt = Date.now();
      countdown.handle = setTimeout(() => {
        forget(id);
        remove(id);
      }, countdown.remaining);
    },
    [forget, remove],
  );

  const suspend = useCallback(() => {
    for (const countdown of countdowns.current.values()) {
      if (countdown.handle === null) continue;
      clearTimeout(countdown.handle);
      countdown.handle = null;
      countdown.remaining = Math.max(0, countdown.remaining - (Date.now() - countdown.startedAt));
    }
  }, []);

  const resume = useCallback(() => {
    for (const [id, countdown] of countdowns.current) if (countdown.handle === null) run(id, countdown);
  }, [run]);

  const start = useCallback(
    (id: number) => {
      const countdown: Countdown = { handle: null, remaining: SUCCESS_MS, startedAt: 0 };
      countdowns.current.set(id, countdown);
      if (holds.current.size === 0) run(id, countdown);
    },
    [run],
  );

  const dismiss = useCallback(
    (id: number) => {
      const held = holds.current.size > 0;
      forget(id);
      if (held && holds.current.size === 0) resume();
      remove(id);
    },
    [forget, resume, remove],
  );

  // Ruimt de aftellers en holds op van toasts die niet meer in de lijst staan (het maximum liet ze wegvallen).
  const prune = useCallback(
    (alive: ReadonlySet<number>) => {
      const held = holds.current.size > 0;
      for (const id of [...countdowns.current.keys(), ...holds.current.values()]) if (!alive.has(id)) forget(id);
      if (held && holds.current.size === 0) resume();
    },
    [forget, resume],
  );

  const hold = useCallback(
    (id: number, kind: HoldKind) => {
      if (holds.current.size === 0) suspend();
      holds.current.set(holdKey(id, kind), id);
    },
    [suspend],
  );

  const release = useCallback(
    (id: number, kind: HoldKind) => {
      if (holds.current.delete(holdKey(id, kind)) && holds.current.size === 0) resume();
    },
    [resume],
  );

  useEffect(() => {
    const pending = countdowns.current;
    return () => {
      for (const countdown of pending.values()) clearTimeout(countdown.handle ?? undefined);
      pending.clear();
    };
  }, []);

  return { start, dismiss, prune, hold, release };
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const { start, dismiss, prune, hold, release } = useCountdowns(remove);

  useEffect(() => {
    prune(new Set(toasts.map((toast) => toast.id)));
  }, [toasts, prune]);

  const add = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, message }].slice(-MAX_TOASTS));
      if (tone === 'success') start(id);
    },
    [start],
  );

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
  const state = useMemo<ToastState>(() => ({ toasts, dismiss, hold, release }), [toasts, dismiss, hold, release]);

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

function ToastCard({ toast }: { readonly toast: ToastItem }) {
  const { dismiss, hold, release } = useContext(ToastStateContext);
  const isError = toast.tone === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      onMouseEnter={() => {
        hold(toast.id, 'hover');
      }}
      onMouseLeave={() => {
        release(toast.id, 'hover');
      }}
      onFocus={() => {
        hold(toast.id, 'focus');
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) release(toast.id, 'focus');
      }}
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
          dismiss(toast.id);
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

export function Toaster() {
  const { toasts } = useContext(ToastStateContext);
  const successes = toasts.filter((toast) => toast.tone === 'success');
  const errors = toasts.filter((toast) => toast.tone === 'error');
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:start-auto sm:w-96">
      <div aria-live="polite" className="flex w-full flex-col gap-2">
        {successes.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
      <div aria-live="assertive" className="flex w-full flex-col gap-2">
        {errors.map((toast) => (
          <ToastCard key={toast.id} toast={toast} />
        ))}
      </div>
    </div>
  );
}
