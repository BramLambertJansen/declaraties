import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

// Melding op de pagina: status (bijv. "Uitnodiging verstuurd naar …"), succes, waarschuwing of fout. role volgt de
// soort: alleen een fout onderbreekt de schermlezer (alert); de rest is een beleefde status.
const noticeVariants = cva('rounded-md border px-3 py-2 text-sm', {
  variants: {
    tone: {
      info: 'border-border bg-muted text-foreground',
      error: 'border-destructive bg-background font-medium text-destructive',
      success: 'border-success bg-background font-medium text-success',
      warning: 'border-warning bg-background font-medium text-warning',
    },
  },
  defaultVariants: { tone: 'info' },
});

export function Notice({
  tone = 'info',
  children,
}: {
  readonly tone?: 'info' | 'error' | 'success' | 'warning';
  readonly children: ReactNode;
}) {
  return (
    <p role={tone === 'error' ? 'alert' : 'status'} className={noticeVariants({ tone })}>
      {children}
    </p>
  );
}
