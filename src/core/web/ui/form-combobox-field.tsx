import { useEffect, useId, useState } from 'react';
import { useController, type FieldPathByValue, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { assert } from '#core/shared/assert.ts';
import { Combobox, type ComboboxClearProps, type ComboboxOption } from './combobox.tsx';
import { Field } from './field.tsx';

export type FormComboboxFieldProps<Input extends FieldValues, Output> = ComboboxClearProps & {
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly name: FieldPathByValue<Input, string>;
  readonly label: string;
  readonly options: readonly ComboboxOption[];
  readonly description?: string;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly emptyText?: string;
};

export function FormComboboxField<Input extends FieldValues, Output>(props: FormComboboxFieldProps<Input, Output>) {
  const { form, name, label, options, description, disabled, placeholder, emptyText } = props;
  const { field, fieldState } = useController({ control: form.control, name });
  const [reset, setReset] = useState(0);
  useEffect(() => {
    const subscription = form.watch((_values, event) => {
      if (event.name === undefined) setReset((version) => version + 1);
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [form]);
  const clearing: ComboboxClearProps = props.clearable
    ? { clearable: true, clearLabel: props.clearLabel }
    : { clearable: false };
  const id = useId();
  const value: unknown = field.value;
  assert(typeof value === 'string', 'FormComboboxField requires a string default value');
  const describedBy =
    [description === undefined ? null : `${id}-hulp`, fieldState.error === undefined ? null : `${id}-fout`]
      .filter((part) => part !== null)
      .join(' ') || undefined;
  return (
    <Field id={id} label={label} description={description} error={fieldState.error?.message}>
      <Combobox
        resetKey={reset}
        id={id}
        name={field.name}
        value={value}
        onValueChange={field.onChange}
        ref={field.ref}
        onBlur={field.onBlur}
        options={options}
        disabled={disabled}
        placeholder={placeholder}
        emptyText={emptyText}
        {...clearing}
        aria-invalid={fieldState.error !== undefined}
        aria-describedby={describedBy}
      />
    </Field>
  );
}
