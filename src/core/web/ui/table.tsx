import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

// Tabel (spec accountbeheer). De omhulling scrolt zelf horizontaal, zodat de pagina op 375 px niet breder wordt.
// relative: anders hangt een absoluut element (sr-only kolomkop) aan de pagina en steekt het buiten beeld.
// Met het toetsenbord te scrollen (WCAG 2.1.1, axe scrollable-region-focusable): de omhulling is focusbaar en heeft een naam.
export function Table({ className, label, ...props }: ComponentProps<'table'> & { readonly label: string }) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="relative w-full overflow-x-auto rounded-lg border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-muted [&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b', className)} {...props} />;
}

export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope="col"
      className={cn('h-11 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground', className)}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-3 py-2 align-middle whitespace-nowrap', className)} {...props} />;
}
