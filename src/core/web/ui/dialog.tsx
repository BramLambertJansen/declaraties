import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './button.tsx';
import { cn } from './cn.ts';

// Dialoog op het native <dialog> (showModal): modaal, focus gevangen, Esc annuleert, focus terug naar de opener.
// Geen Radix Dialog: die vergrendelt het scrollen met een inline <style>, wat de CSP (style-src 'self') blokkeert
// (framework §6); hier doet CSS dat (body:has(dialog[open]) in styles/index.css).
//
// Varianten: 'modal' (gecentreerd, voor formulieren en bevestigingen) en 'sheet' (schuift vanaf links over het scherm, op
// volle hoogte; voor navigatie op smalle schermen). Een klik op de verduisterde strook naast de sheet sluit hem.

interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description?: string;
  readonly closeLabel?: string;
  readonly variant?: 'modal' | 'sheet';
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  // false: Esc, de sluitknop en de backdrop doen niets (bijv. terwijl een bevestigde actie loopt). Sluit de browser hem toch
  // (Chrome: een tweede Esc zonder klik ertussen), dan gaat hij meteen weer open, zodat state en scherm gelijk blijven.
  readonly dismissible?: boolean;
  // 'alertdialog' voor een bevestiging vóór een onomkeerbare actie (ConfirmDialog, WAI-ARIA).
  readonly role?: 'dialog' | 'alertdialog';
}

// Openen en sluiten via CSS-overgangen; bij prefers-reduced-motion zijn ze ingekort (styles/index.css).
const variantClasses = {
  modal: 'm-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-popover text-popover-foreground',
  sheet:
    'my-0 ms-0 me-auto h-dvh max-h-none w-72 max-w-[calc(100%-3rem)] border-e bg-sidebar text-sidebar-foreground ' +
    'transition-[translate,overlay,display] transition-discrete duration-200 ease-out ' +
    '-translate-x-full open:translate-x-0 starting:open:-translate-x-full ' +
    'backdrop:transition-[opacity,overlay,display] backdrop:transition-discrete backdrop:duration-200 ' +
    'backdrop:opacity-0 open:backdrop:opacity-100 starting:open:backdrop:opacity-0',
} as const;

function focusTarget(dialog: HTMLDialogElement, selector: string): HTMLElement | undefined {
  return [...dialog.querySelectorAll<HTMLElement>(selector)].find(
    (element) => !element.matches(':disabled, [type="hidden"]') && element.closest('[hidden], [inert]') === null,
  );
}

// Openen met de focus op een bruikbaar element met data-autofocus (ConfirmDialog: "Annuleren"), anders op het eerste veld (spec
// accountbeheer). React's autoFocus vuurt vóór showModal, als de dialoog nog dicht is, en zonder veld kiest showModal zelf
// (de sluitknop).
function openModal(dialog: HTMLDialogElement) {
  dialog.showModal();
  (focusTarget(dialog, '[data-autofocus]') ?? focusTarget(dialog, 'input, select, textarea'))?.focus();
}

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  // true zolang wij zelf sluiten (open werd false); anders kwam het close-event van de browser (Esc).
  const closing = useRef(false);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) openModal(dialog);
    if (!open && dialog.open) {
      closing.current = true;
      dialog.close();
    }
  }, [open]);
  return { ref, closing };
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel = 'Sluiten',
  variant = 'modal',
  children,
  footer,
  dismissible = true,
  role = 'dialog',
}: DialogProps) {
  const { ref, closing } = useModal(open);
  const id = useId();
  const sheet = variant === 'sheet';

  return (
    <dialog
      ref={ref}
      role={role === 'alertdialog' ? role : undefined}
      aria-labelledby={`${id}-titel`}
      aria-describedby={description === undefined ? undefined : `${id}-uitleg`}
      onClose={(event) => {
        const requested = closing.current;
        closing.current = false;
        if (!requested && !dismissible) {
          openModal(event.currentTarget);
          return;
        }
        onOpenChange(false);
      }}
      onCancel={(event) => {
        if (!dismissible) event.preventDefault();
      }}
      // Een geannuleerde keydown is geen sluitverzoek (HTML-spec); zo houdt ook een herhaalde Esc in Chrome hem open.
      onKeyDown={(event) => {
        if (!dismissible && event.key === 'Escape') event.preventDefault();
      }}
      // Een klik op de backdrop heeft de <dialog> zelf als doel; binnen de sheet is het doel altijd een kind.
      onClick={(event) => {
        if (dismissible && sheet && event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn('p-0 shadow-lg', variantClasses[variant])}
    >
      {/* Een modal begint elke keer leeg (formulieren); een sheet blijft staan, zodat hij ook dicht kan schuiven. */}
      {open || sheet ? (
        <div className={sheet ? 'flex h-full flex-col' : 'flex flex-col gap-4 p-6'}>
          <div className={cn('flex items-start justify-between gap-4', sheet && 'items-center border-b px-4 py-2')}>
            <div className="flex flex-col gap-1.5">
              <h2
                id={`${id}-titel`}
                className={sheet ? 'text-base font-semibold' : 'text-lg leading-none font-semibold'}
              >
                {title}
              </h2>
              {description === undefined ? null : (
                <p id={`${id}-uitleg`} className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={closeLabel}
              disabled={!dismissible}
              onClick={() => {
                onOpenChange(false);
              }}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className={sheet ? 'min-h-0 flex-1 overflow-y-auto' : 'contents'}>{children}</div>
          {footer === undefined ? null : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
