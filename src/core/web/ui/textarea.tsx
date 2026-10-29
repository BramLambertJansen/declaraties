import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { inputBase } from './input.tsx';

export function Textarea({ className, rows = 3, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(inputBase, 'resize-y py-2', className)} {...props} />;
}
