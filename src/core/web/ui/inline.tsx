import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { gapVariants } from './stack.tsx';

// Horizontale rij die op smalle schermen doorloopt naar de volgende regel.
const inlineVariants = cva('flex flex-row flex-wrap', {
  variants: {
    gap: gapVariants,
    align: { start: 'items-start', center: 'items-center', baseline: 'items-baseline' },
    justify: { start: 'justify-start', between: 'justify-between', end: 'justify-end' },
  },
  defaultVariants: { gap: 'sm', align: 'center', justify: 'start' },
});

export type InlineProps = ComponentProps<'div'> & VariantProps<typeof inlineVariants>;

export function Inline({ gap, align, justify, className, ...props }: InlineProps) {
  return <div className={cn(inlineVariants({ gap, align, justify }), className)} {...props} />;
}
