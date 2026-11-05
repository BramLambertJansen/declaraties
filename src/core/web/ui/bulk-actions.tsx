import type { ReactNode } from 'react';
import { assert } from '#core/shared/assert.ts';
import { Button } from './button.tsx';

export interface BulkActionsProps {
  readonly selectedCount: number;
  readonly summary: string;
  readonly label: string;
  readonly clearLabel: string;
  readonly onClear: () => void;
  readonly busy?: boolean;
  readonly children: ReactNode;
}

export function BulkActions({
  selectedCount,
  summary,
  label,
  clearLabel,
  onClear,
  busy = false,
  children,
}: BulkActionsProps) {
  assert(Number.isSafeInteger(selectedCount) && selectedCount >= 0, 'BulkActions needs a non-negative integer count');
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4" aria-busy={busy}>
      <p role="status" className="text-sm font-medium">
        {summary}
      </p>
      <fieldset
        disabled={busy || selectedCount === 0}
        aria-label={label}
        className="flex min-w-0 flex-wrap gap-2"
        onClickCapture={(event) => {
          if (busy || selectedCount === 0) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <Button variant="outline" onClick={onClear}>
          {clearLabel}
        </Button>
        {children}
      </fieldset>
    </div>
  );
}
