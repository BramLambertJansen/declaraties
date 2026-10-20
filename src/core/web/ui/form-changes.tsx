import { useFormState, type FieldPath, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { useEffect, useRef } from 'react';
import { Button } from './button.tsx';

export function FormChanges<Input extends FieldValues, Output>({
  form,
  message,
  discardLabel,
  focusOnDiscard,
}: {
  readonly form: UseFormReturn<Input, unknown, Output>;
  readonly message: string;
  readonly discardLabel: string;
  readonly focusOnDiscard: FieldPath<Input>;
}) {
  const { isDirty, isSubmitting } = useFormState({ control: form.control });
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!isDirty && restoreFocus.current) {
      restoreFocus.current = false;
      form.setFocus(focusOnDiscard);
    }
  }, [isDirty, form, focusOnDiscard]);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-muted-foreground">
        {isDirty ? message : ''}
      </p>
      {isDirty ? (
        <Button
          variant="outline"
          disabled={isSubmitting}
          onClick={() => {
            restoreFocus.current = true;
            form.reset();
          }}
        >
          {discardLabel}
        </Button>
      ) : null}
    </div>
  );
}
