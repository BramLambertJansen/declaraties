import { cva } from 'class-variance-authority';

// Recept (framework §7): basis met 44 px en focusring, en een variantkaart die een app kan afleiden in src/web/ui.
// Een nieuwe variant krijgt een rij in de contrasttest (test/ui/contrast.test.ts).
export const buttonBase =
  'inline-flex min-h-control items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

export const buttonVariantMap = {
  variant: {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline: 'border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
    ghost: 'bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  },
  size: {
    md: '',
    icon: 'min-w-control px-0',
  },
} as const;

export const buttonVariants = cva(buttonBase, {
  variants: buttonVariantMap,
  defaultVariants: { variant: 'primary', size: 'md' },
});
