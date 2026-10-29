import { useEffect, useRef, type ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { Dialog } from './dialog.tsx';

// Bevestiging vóór een actie die je niet zomaar terugdraait (roadmap 3f): blokkeren, verwijderen, sessies beëindigen.
// De focus staat bij openen op "Annuleren", zodat Enter of een dubbele klik niets kapotmaakt. onConfirm vuurt hooguit één
// keer per openen, tot `busy` weer false wordt (na een fout: opnieuw proberen). Tijdens `busy` sluiten Esc, de sluitknop
// en Annuleren niets en toont de bevestigknop "Bezig…" (aria-disabled, zodat de focus erop blijft staan). Sluiten doet de
// ouder na succes (bijv. in onSuccess van de mutatie); een fout toont de ouder als children (bijv. <Notice>).

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  readonly description: string;
  // Werkwoord van de actie ("Blokkeren"), niet "OK" of "Ja".
  readonly confirmLabel: string;
  readonly onConfirm: () => void;
  // Rood voor verwijderen en blokkeren; standaard aan, want daar is deze dialoog voor.
  readonly destructive?: boolean;
  readonly busy?: boolean;
  readonly children?: ReactNode;
}

// Een snelle dubbelklik komt binnen vóór de ouder `busy` zet (TanStack Query zet isPending pas na een tick). Daarom vuurt
// onConfirm één keer, en mag het opnieuw na busy → niet busy (een fout), of na RETRY_AFTER_MS als busy nooit true werd
// (een ouder zonder busy, of een mutatie die faalde vóór isPending gerenderd werd): de knop blijft nooit stil dood.
const RETRY_AFTER_MS = 500;

function useConfirmOnce(open: boolean, busy: boolean) {
  const confirmed = useRef(false);
  const busyNow = useRef(busy);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (open) confirmed.current = false;
    return () => {
      clearTimeout(retryTimer.current);
    };
  }, [open]);
  useEffect(() => {
    if (busyNow.current && !busy) confirmed.current = false;
    busyNow.current = busy;
  }, [busy]);
  return (onConfirm: () => void) => {
    if (busyNow.current || confirmed.current) return;
    confirmed.current = true;
    clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      if (!busyNow.current) confirmed.current = false;
    }, RETRY_AFTER_MS);
    onConfirm();
  };
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
  busy = false,
  children,
}: ConfirmDialogProps) {
  const confirmOnce = useConfirmOnce(open, busy);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      dismissible={!busy}
      role="alertdialog"
      title={title}
      description={description}
      closeLabel={uiTexts.close}
      footer={
        <>
          <Button
            variant="outline"
            data-autofocus=""
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            {uiTexts.cancel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            aria-disabled={busy}
            className="aria-disabled:opacity-50"
            onClick={() => {
              confirmOnce(onConfirm);
            }}
          >
            {busy ? uiTexts.busy : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
