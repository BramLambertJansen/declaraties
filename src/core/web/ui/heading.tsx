import { cva } from 'class-variance-authority';
import { createElement, type ReactNode } from 'react';
import { cn } from './cn.ts';

// Kop binnen een scherm. Geen niveau 1: de enige h1 is PageTitle (zet ook de paginatitel en krijgt de focus na navigatie).
const headingVariants = cva('font-semibold', {
  variants: { level: { 2: 'text-xl', 3: 'text-lg', 4: 'text-base' } },
});

export interface HeadingProps {
  readonly level: 2 | 3 | 4;
  readonly id?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Heading({ level, id, className, children }: HeadingProps) {
  return createElement(`h${String(level)}`, { id, className: cn(headingVariants({ level }), className) }, children);
}
