import type { ReactNode } from 'react';

export interface ListProps {
  readonly children: ReactNode;
  readonly 'aria-label'?: string;
}
export function List({ children, ...props }: ListProps) {
  return (
    <ul {...props} className="flex min-w-0 flex-col divide-y rounded-lg border">
      {children}
    </ul>
  );
}
export interface ListItemProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly leading?: ReactNode;
  readonly actions?: ReactNode;
}
export function ListItem({ title, description, leading, actions }: ListItemProps) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-3 p-4">
      {leading === undefined ? null : (
        <span aria-hidden="true" className="shrink-0">
          {leading}
        </span>
      )}
      <div className="min-w-0 flex-1 break-words">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {description === undefined ? null : <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions === undefined ? null : <div className="flex max-w-full flex-wrap gap-2">{actions}</div>}
    </li>
  );
}
