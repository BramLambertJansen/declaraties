import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { UserCog, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ROLES, type Role } from '#core/shared/can.ts';
import { roleLabels } from '#web/copy/ui.ts';
import { Button, cn, Notice, useErrorText } from '#web/ui/index.ts';
import { useCurrentRole } from './queries.ts';
import { switchRole } from './switch-role.ts';

// Dev-rolwisselaar (spec accounts/AC-8, besluit eigenaar 2026-10-10): op elk scherm, ook ingelogd, een tabje rechts; een
// klik schuift een paneel in met een knop per rol uit ROLES. Een nieuwe rol staat er dus vanzelf bij (seed-account en naam
// zijn Record<Role, …>). Alleen lokaal: src/web/dev is leeg in de productiebundel. De teksten staan daarom hier en niet
// in src/web/copy.

const PANEL_ID = 'dev-rolwisselaar';

export function DevRoleSwitcher() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const current = useCurrentRole();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // Open: focus naar de eerste rol. Esc sluit en zet de focus terug op het tabje.
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>('button[aria-pressed]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (role: Role) => {
    setError(null);
    switchRole(role, queryClient, navigate).then(
      () => {
        setOpen(false);
      },
      (failure: unknown) => {
        setError(errorText(failure));
      },
    );
  };

  return (
    <>
      <Button
        ref={trigger}
        variant="outline"
        size="icon"
        aria-label="Rol wisselen (alleen lokaal)"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        className="fixed top-1/2 right-0 z-overlay -translate-y-1/2 rounded-e-none border-e-0 shadow-md"
        onClick={() => {
          setOpen(!open);
        }}
      >
        <UserCog aria-hidden="true" />
      </Button>
      <aside
        id={PANEL_ID}
        ref={panel}
        aria-label="Rol wisselen"
        inert={!open}
        className={cn(
          'fixed top-1/2 right-0 z-modal flex w-64 max-w-[calc(100vw-1rem)] -translate-y-1/2 flex-col gap-3 rounded-s-lg',
          'border border-e-0 bg-popover p-4 text-popover-foreground shadow-lg transition-transform duration-normal',
          open ? 'translate-x-0' : 'invisible translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Lokaal inloggen als</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Sluiten"
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <div className="flex flex-col gap-2">
          {ROLES.map((role) => (
            <Button
              key={role}
              variant={role === current ? 'primary' : 'outline'}
              aria-pressed={role === current}
              onClick={() => {
                choose(role);
              }}
            >
              {roleLabels[role]}
            </Button>
          ))}
        </div>
      </aside>
    </>
  );
}
