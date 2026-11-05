import { CalendarDays } from 'lucide-react';
import { useId, useImperativeHandle, useRef, useState, type ComponentProps } from 'react';
import { assert } from '#core/shared/assert.ts';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { cn } from './cn.ts';
import { Input } from './input.tsx';

export type DateInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  readonly pickerLabel?: string;
};

function openPicker(input: HTMLInputElement | null) {
  if (input === null) return false;
  input.focus();
  try {
    if (typeof input.showPicker !== 'function') return false;
    input.showPicker();
    return true;
  } catch {
    // Houd native datuminvoer bruikbaar als de browser de kalender niet kan openen.
    input.focus();
    return false;
  }
}

// Een kalenderdatum blijft YYYY-MM-DD (of leeg); geen Date, tijdzone of eigen kalender.
export function DateInput({
  id,
  ref,
  className,
  disabled,
  readOnly,
  pickerLabel = uiTexts.openCalendar,
  ...props
}: DateInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const [nativeOnly, setNativeOnly] = useState(false);
  const canOpen =
    !nativeOnly &&
    typeof HTMLInputElement !== 'undefined' &&
    typeof HTMLInputElement.prototype.showPicker === 'function';
  useImperativeHandle(ref, () => {
    assert(input.current !== null, 'DateInput input must be mounted');
    return input.current;
  });
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        {...props}
        id={inputId}
        ref={input}
        type="date"
        disabled={disabled}
        readOnly={readOnly}
        className={cn(
          'h-control min-w-0 flex-1',
          canOpen && '[&::-webkit-calendar-picker-indicator]:hidden',
          className,
        )}
      />
      {canOpen ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-control shrink-0"
          disabled={disabled || readOnly}
          aria-label={pickerLabel}
          title={pickerLabel}
          aria-controls={inputId}
          onClick={() => {
            if (!openPicker(input.current)) setNativeOnly(true);
          }}
        >
          <CalendarDays aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
