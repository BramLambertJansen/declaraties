import { useEffect, useId, useRef } from 'react';
import { useFormState, type FieldPath, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { Button } from './button.tsx';

export interface FormErrorSummaryOptions<Input extends FieldValues> {
  readonly title: string;
  readonly fields: readonly { readonly name: FieldPath<Input>; readonly label: string }[];
}

export function FormErrorSummary<Input extends FieldValues, Output>({
  form,
  title,
  fields,
}: FormErrorSummaryOptions<Input> & { readonly form: UseFormReturn<Input, unknown, Output> }) {
  const state = useFormState({ control: form.control });
  const errors = fields.flatMap((field) => {
    const message = form.getFieldState(field.name, state).error?.message;
    return message === undefined ? [] : [{ ...field, message }];
  });
  const heading = useId();
  const summary = useRef<HTMLDivElement>(null);
  const handledSubmit = useRef(0);
  useEffect(() => {
    if (handledSubmit.current === state.submitCount) return;
    handledSubmit.current = state.submitCount;
    if (errors.length > 0) summary.current?.focus();
  }, [errors.length, state.submitCount]);
  if (state.submitCount === 0 || errors.length === 0) return null;
  return (
    <div
      ref={summary}
      tabIndex={-1}
      aria-labelledby={heading}
      className="rounded-md border border-destructive p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 id={heading} className="font-semibold text-destructive">
        {title}
      </h3>
      <ul className="flex flex-col items-start gap-1">
        {errors.map((error) => (
          <li key={error.name} className="min-w-0 max-w-full">
            <Button
              variant="ghost"
              className="h-auto whitespace-normal text-start"
              onClick={() => {
                form.setFocus(error.name);
              }}
            >
              {error.label}: {error.message}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
