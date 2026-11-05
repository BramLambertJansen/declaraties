import type { ReactNode } from 'react';

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}

// Label boven het veld, hulptekst en fout eronder (framework §7). De ids sluiten aan op aria-describedby van FormField.
export function Field({ id, label, description, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {description === undefined ? null : (
        <p id={`${id}-hulp`} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-fout`} className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
