import { useId, type Ref } from 'react';

export interface RadioOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface RadioGroupProps {
  readonly id?: string;
  readonly name?: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly RadioOption[];
  readonly onValueChange: (value: string) => void;
  readonly onBlur?: () => void;
  readonly ref?: Ref<HTMLInputElement>;
  readonly disabled?: boolean | undefined;
  readonly description?: string | undefined;
  readonly error?: string | undefined;
}

// Native radios leveren exclusieve selectie en pijltjestoetsen. De ref wijst naar het eerste bruikbare groepsanker.
export function RadioGroup(props: RadioGroupProps) {
  const { id, name, label, value, options, onValueChange, onBlur, ref, disabled, description, error } = props;
  const generatedId = useId();
  const groupId = id ?? generatedId;
  const anchor = options.find((option) => !option.disabled)?.value;
  const describedBy =
    [description === undefined ? null : `${groupId}-hulp`, error === undefined ? null : `${groupId}-fout`]
      .filter((part) => part !== null)
      .join(' ') || undefined;
  return (
    <fieldset id={groupId} disabled={disabled} className="flex min-w-0 flex-col gap-1.5">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="flex min-h-control items-center gap-3 text-sm text-foreground">
          <input
            type="radio"
            name={name ?? groupId}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            ref={option.value === anchor ? ref : undefined}
            onChange={(event) => {
              onValueChange(event.currentTarget.value);
            }}
            onBlur={onBlur}
            aria-invalid={error !== undefined}
            aria-describedby={describedBy}
            className="size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          />
          {option.label}
        </label>
      ))}
      {description === undefined ? null : (
        <p id={`${groupId}-hulp`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${groupId}-fout`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
