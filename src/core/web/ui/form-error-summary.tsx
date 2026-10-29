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
    const error = form.getFieldState(field.name, state).error;
    return error?.message === undefined ? [] : [{ ...field, message: error.message, type: error.type }];
  });
  const heading = useId();
  const summary = useRef<HTMLDivElement>(null);
  const handled = useRef({ submit: 0, serverErrors: '[]' });
  const hasErrors = errors.length > 0;
  const serverErrors = JSON.stringify(
    errors.filter((error) => error.type === 'server').map(({ name, message }) => [name, message]),
  );
  useEffect(() => {
    const newSubmit = handled.current.submit !== state.submitCount;
    const newServerErrors = serverErrors !== '[]' && handled.current.serverErrors !== serverErrors;
    handled.current = { submit: state.submitCount, serverErrors };
    if (state.submitCount === 0 || !hasErrors || (!newSubmit && !newServerErrors)) return;
    // RHF plant zelf nog een veldfocus vóór submitCount wijzigt. Onze focus volgt die timer, ook als React
    // effects vóór de timers uitvoert. Unmount of nieuwe invoer annuleert de geplande focus.
    const timer = setTimeout(() => {
      summary.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
    };
  }, [hasErrors, state.submitCount, serverErrors]);
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
