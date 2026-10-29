import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn.ts';

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'children'> & {
  readonly label: ReactNode;
};

export function Checkbox({ id, label, className, ...props }: CheckboxProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  return (
    <label htmlFor={controlId} className="flex min-h-control items-center gap-3 text-sm font-medium text-foreground">
      <input
        {...props}
        id={controlId}
        type="checkbox"
        className={cn(
          'size-5 shrink-0 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
      {label}
    </label>
  );
}
