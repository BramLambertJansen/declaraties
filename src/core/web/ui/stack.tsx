import { cva, type VariantProps } from 'class-variance-authority';
import { createElement, type HTMLAttributes } from 'react';
import { cn } from './cn.ts';

// Verticale stapel met afstand uit een vaste schaal; dezelfde schaal als Inline.
export const gapVariants = { xs: 'gap-1', sm: 'gap-2', md: 'gap-4', lg: 'gap-6', xl: 'gap-8' } as const;

const stackVariants = cva('flex flex-col', { variants: { gap: gapVariants }, defaultVariants: { gap: 'md' } });

export type StackProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof stackVariants> & { readonly as?: 'div' | 'section' | 'ul' | 'ol' };

export function Stack({ as = 'div', gap, className, ...props }: StackProps) {
  return createElement(as, { ...props, className: cn(stackVariants({ gap }), className) });
}
