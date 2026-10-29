import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { inputBase } from './input.tsx';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

// Native <select>: toetsenbord, schermlezer en mobiel werken zoals de gebruiker gewend is; dezelfde rand en focusring als Input.
export function Select({
  options,
  className,
  ...props
}: ComponentProps<'select'> & { readonly options: readonly SelectOption[] }) {
  return (
    <div className="relative">
      <select className={cn(inputBase, 'appearance-none pe-10', className)} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
