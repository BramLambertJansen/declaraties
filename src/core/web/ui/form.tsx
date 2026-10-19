import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useId, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  useController,
  useForm,
  type DefaultValues,
  type FieldPath,
  type FieldPathByValue,
  type FieldValues,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import { assert } from '#core/shared/assert.ts';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { useErrorText } from './error-texts.tsx';
import { Field } from './field.tsx';

// Formulieren (framework §5): zodResolver op het gedeelde schema, valideren bij verlaten en daarna bij typen
// (mode onTouched), verzendknop uit tijdens het versturen, serverfouten per veld via setError. useForm alleen hier.

export function useZodForm<Input extends FieldValues, Output extends FieldValues>(
  schema: z.ZodType<Output, Input>,
  defaultValues: DefaultValues<Input>,
): UseFormReturn<Input, unknown, Output> {
  return useForm<Input, unknown, Output>({ resolver: zodResolver(schema), defaultValues, mode: 'onTouched' });
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

interface FormProps<Input extends FieldValues, Output> {
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly onSubmit: (values: Output) => Promise<unknown>;
  readonly submitLabel: string;
  // Foutcode van de server → veld (bijv. ALREADY_EXISTS → 'email'); een andere code komt boven het formulier.
  readonly fieldForCode?: Readonly<Partial<Record<string, FieldPath<Input>>>>;
  // Naast de verzendknop, bijv. "Annuleren" in een dialoog.
  readonly secondaryAction?: ReactNode;
  readonly children: ReactNode;
}

export function Form<Input extends FieldValues, Output>(props: FormProps<Input, Output>) {
  const { form, onSubmit, submitLabel, fieldForCode, secondaryAction, children } = props;
  const errorText = useErrorText();
  const [formError, setFormError] = useState<string | null>(null);
  const alert = useRef<HTMLParagraphElement>(null);

  // Na een fout gaat de focus naar de melding (spec accountbeheer, toegankelijkheid).
  useEffect(() => {
    if (formError !== null) alert.current?.focus();
  }, [formError]);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      const code = codeOf(error) ?? '';
      const field = fieldForCode !== undefined && Object.hasOwn(fieldForCode, code) ? fieldForCode[code] : undefined;
      if (field === undefined) setFormError(errorText(error));
      else form.setError(field, { type: 'server', message: errorText(error) }, { shouldFocus: true });
    }
  });

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
      {formError === null ? null : (
        <p
          role="alert"
          tabIndex={-1}
          ref={alert}
          className="rounded-md border border-destructive px-3 py-2 text-sm font-medium text-destructive"
        >
          {formError}
        </p>
      )}
      {children}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {secondaryAction}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? uiTexts.busy : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export interface FieldProps {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  readonly onBlur: () => void;
  readonly ref: (element: HTMLElement | null) => void;
  readonly 'aria-invalid': boolean;
  readonly 'aria-describedby': string | undefined;
}

interface FormFieldProps<Input extends FieldValues, Output> {
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly name: FieldPathByValue<Input, string>;
  readonly label: string;
  readonly description?: string;
  readonly children: (field: FieldProps) => ReactNode;
}

// Label boven het veld, hulptekst en fout eronder (Field), gekoppeld via aria-describedby. Het kind is meestal <Input {...field} />.
export function FormField<Input extends FieldValues, Output>(props: FormFieldProps<Input, Output>) {
  const { form, name, label, description, children } = props;
  const { field, fieldState } = useController({ control: form.control, name });
  const id = useId();
  const describedBy = [
    description === undefined ? null : `${id}-hulp`,
    fieldState.error === undefined ? null : `${id}-fout`,
  ].filter((part) => part !== null);
  const value: unknown = field.value;
  assert(typeof value === 'string', 'FormField requires a string default value');

  return (
    <Field id={id} label={label} description={description} error={fieldState.error?.message}>
      {children({
        id,
        name: field.name,
        value,
        onChange: field.onChange,
        onBlur: field.onBlur,
        ref: field.ref,
        'aria-invalid': fieldState.error !== undefined,
        'aria-describedby': describedBy.length === 0 ? undefined : describedBy.join(' '),
      })}
    </Field>
  );
}
