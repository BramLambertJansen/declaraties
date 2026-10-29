import { cva, type VariantProps } from 'class-variance-authority';
import { createElement, type HTMLAttributes } from 'react';
import { cn } from './cn.ts';

// Lopende tekst: grootte, toon en gewicht uit het recept, zodat features/ geen typografie- of kleurklassen nodig heeft.
const textVariants = cva('', {
  variants: {
    size: { sm: 'text-sm', base: 'text-base' },
    tone: { default: 'text-foreground', muted: 'text-muted-foreground' },
    weight: { normal: 'font-normal', medium: 'font-medium' },
  },
  defaultVariants: { size: 'base', tone: 'default', weight: 'normal' },
});

export type TextProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & { readonly as?: 'p' | 'span' | 'div' };

export function Text({ as = 'p', size, tone, weight, className, ...props }: TextProps) {
  return createElement(as, { ...props, className: cn(textVariants({ size, tone, weight }), className) });
}
