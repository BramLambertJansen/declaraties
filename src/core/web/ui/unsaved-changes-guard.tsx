import { useBlocker } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ConfirmDialog } from './confirm-dialog.tsx';

export interface UnsavedChangesGuardProps {
  readonly when: boolean;
  readonly busy?: boolean;
  readonly title: string;
  readonly description: string;
  readonly discardLabel: string;
}

export function UnsavedChangesGuard({
  when,
  busy = false,
  title,
  description,
  discardLabel,
}: UnsavedChangesGuardProps) {
  const blocker = useBlocker({
    shouldBlockFn: () => when || busy,
    enableBeforeUnload: when || busy,
    disabled: !when && !busy,
    withResolver: true,
  });
  useEffect(() => {
    if (!when && !busy && blocker.status === 'blocked') blocker.reset();
  }, [when, busy, blocker]);
  const reset = blocker.reset;
  useEffect(
    () => () => {
      reset?.();
    },
    [reset],
  );
  return (
    <ConfirmDialog
      open={blocker.status === 'blocked'}
      title={title}
      description={description}
      confirmLabel={discardLabel}
      busy={busy}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.();
      }}
      onConfirm={() => {
        if (!busy) blocker.proceed?.();
      }}
    />
  );
}
