import { cva } from 'class-variance-authority';
import { cn } from '#core/web/ui/cn.ts';

// Tekstvoorbeeld per typografietoken voor de catalogus (spec semantische-tokens, 3c): precies text-{size} en
// font-{weight}, of font-mono. De tekst noemt de variant, zodat de catalogus zonder extra uitleg leesbaar is.
const typeSampleVariants = cva('text-foreground', {
  variants: {
    size: { sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl', '2xl': 'text-2xl' },
    weight: { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' },
    family: { sans: 'font-sans', mono: 'font-mono' },
  },
  defaultVariants: { size: 'base', weight: 'normal', family: 'sans' },
});

export interface TypeSampleProps {
  readonly size?: 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  readonly weight?: 'normal' | 'medium' | 'semibold';
  readonly family?: 'sans' | 'mono';
}

export function TypeSample({ size = 'base', weight = 'normal', family = 'sans' }: TypeSampleProps) {
  const text = family === 'mono' ? `Code ${size}` : `Tekst ${size} · ${weight}`;
  return <p className={cn(typeSampleVariants({ size, weight, family }))}>{text}</p>;
}
