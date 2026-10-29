import { useController, type FieldPathByValue, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { assert } from '#core/shared/assert.ts';
import { RadioGroup, type RadioOption } from './radio-group.tsx';

interface FormRadioGroupFieldProps<Input extends FieldValues, Output> {
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly name: FieldPathByValue<Input, string>;
  readonly label: string;
  readonly options: readonly RadioOption[];
  readonly description?: string;
  readonly disabled?: boolean;
}

export function FormRadioGroupField<Input extends FieldValues, Output>(props: FormRadioGroupFieldProps<Input, Output>) {
  const { form, name, label, options, description, disabled } = props;
  const { field, fieldState } = useController({ control: form.control, name });
  const value: unknown = field.value;
  assert(typeof value === 'string', 'FormRadioGroupField requires a string default value');
  return (
    <RadioGroup
      label={label}
      name={field.name}
      value={value}
      options={options}
      description={description}
      error={fieldState.error?.message}
      disabled={disabled}
      onValueChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}
    />
  );
}
