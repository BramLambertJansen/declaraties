import { CalendarDays } from 'lucide-react';
import { useId, useImperativeHandle, useRef, type ComponentProps } from 'react';
import { assert } from '#core/shared/assert.ts';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { cn } from './cn.ts';
import { Input } from './input.tsx';

export type DateInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  readonly pickerLabel?: string;
};

function openPicker(input: HTMLInputElement | null) {
  if (input === null) return;
  input.focus();
  try {
    if (typeof input.showPicker === 'function') input.showPicker();
  } catch {
    // Houd native datuminvoer bruikbaar als de browser de kalender niet kan openen.
    input.focus();
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
        className={cn('h-control min-w-0 flex-1 [&::-webkit-calendar-picker-indicator]:hidden', className)}
      />
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
          openPicker(input.current);
        }}
      >
        <CalendarDays aria-hidden="true" />
      </Button>
    </div>
  );
}
