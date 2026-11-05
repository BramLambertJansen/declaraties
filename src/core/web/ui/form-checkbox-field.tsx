import { useId } from 'react';
import { useController, type FieldPathByValue, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { assert } from '#core/shared/assert.ts';
import { Checkbox } from './checkbox.tsx';

interface FormCheckboxFieldProps<Input extends FieldValues, Output> {
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly name: FieldPathByValue<Input, boolean>;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export function FormCheckboxField<Input extends FieldValues, Output>(props: FormCheckboxFieldProps<Input, Output>) {
  const { form, name, label, description, disabled } = props;
  const { field, fieldState } = useController({ control: form.control, name });
  const id = useId();
  const value: unknown = field.value;
  assert(typeof value === 'boolean', 'FormCheckboxField requires a boolean default value');
  const describedBy =
    [description === undefined ? null : `${id}-hulp`, fieldState.error === undefined ? null : `${id}-fout`]
      .filter((part) => part !== null)
      .join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Checkbox
        id={id}
        label={label}
        name={field.name}
        checked={value}
        disabled={disabled}
        onChange={(event) => {
          field.onChange(event.currentTarget.checked);
        }}
        onBlur={field.onBlur}
        ref={field.ref}
        aria-invalid={fieldState.error !== undefined}
        aria-describedby={describedBy}
      />
      {description === undefined ? null : (
        <p id={`${id}-hulp`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {fieldState.error === undefined ? null : (
        <p id={`${id}-fout`} className="text-sm font-medium text-destructive">
          {fieldState.error.message}
        </p>
      )}
    </div>
  );
}
