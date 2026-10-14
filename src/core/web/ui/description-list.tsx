import type { ReactNode } from 'react';
import { assert } from '#core/shared/assert.ts';

export interface DescriptionItem {
  readonly id: string;
  readonly term: string;
  readonly value: ReactNode;
}
export interface DescriptionListProps {
  readonly items: readonly DescriptionItem[];
}
export function DescriptionList({ items }: DescriptionListProps) {
  assert(new Set(items.map((item) => item.id)).size === items.length, 'DescriptionList item ids must be unique');
  return (
    <dl className="flex min-w-0 flex-col divide-y">
      {items.map((item) => (
        <div key={item.id} className="grid min-w-0 gap-2 py-3 md:grid-cols-2 md:gap-4">
          <dt className="min-w-0 text-sm font-medium break-words text-foreground">{item.term}</dt>
          <dd className="min-w-0 text-sm break-words text-muted-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
