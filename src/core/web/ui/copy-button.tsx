import { useRef, useState } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';

export interface CopyButtonProps {
  readonly value: string;
  readonly label?: string;
  readonly copiedLabel?: string;
  readonly errorLabel?: string;
  readonly disabled?: boolean;
}

export function CopyButton({
  value,
  label = uiTexts.copy,
  copiedLabel = uiTexts.copied,
  errorLabel = uiTexts.copyFailed,
  disabled = false,
}: CopyButtonProps) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ value: string; ok: boolean } | null>(null);
  const copy = async () => {
    if (pending.current || disabled) return;
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      await navigator.clipboard.writeText(value);
      setResult({ value, ok: true });
    } catch {
      setResult({ value, ok: false });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const current = result?.value === value ? result : null;
  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        busy={busy}
        busyLabel={uiTexts.busy}
        onClick={() => {
          void copy();
        }}
      >
        {label}
      </Button>
      <p role="status">{current?.ok === true ? copiedLabel : ''}</p>
      <p role="alert">{current?.ok === false ? errorLabel : ''}</p>
    </div>
  );
}
