import type { ReactNode } from 'react';

interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border bg-background p-4 text-foreground">
      <p className="font-medium">{title}</p>
      {description === undefined ? null : <p className="text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
