import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';

const badgeVariants = cva('inline-flex items-center rounded-md px-2 py-1 text-sm font-medium', {
  variants: {
    tone: {
      neutral: 'bg-muted text-muted-foreground',
      accent: 'bg-accent text-accent-foreground',
      destructive: 'bg-destructive text-destructive-foreground',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type StatusBadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function StatusBadge({ tone, className, ...props }: StatusBadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
