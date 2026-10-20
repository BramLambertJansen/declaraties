import type { ComponentProps } from 'react';
import { cn } from './cn.ts';
import { Input } from './input.tsx';

export type DateInputProps = Omit<ComponentProps<'input'>, 'type'>;

// Een kalenderdatum blijft YYYY-MM-DD (of leeg); geen Date, tijdzone of eigen kalender.
export function DateInput({ className, ...props }: DateInputProps) {
  return <Input {...props} type="date" className={cn('min-w-0', className)} />;
}
