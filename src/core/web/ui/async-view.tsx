import type { UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { Button } from './button.tsx';
import { useErrorText } from './error-texts.tsx';

interface AsyncViewProps<Data> {
  readonly query: UseQueryResult<Data> | UseInfiniteQueryResult<Data>;
  // Wanneer de data als leeg telt (bijv. een lege lijst); dan staat emptyText er in plaats van children.
  readonly isEmpty?: (data: Data) => boolean;
  readonly emptyText?: string;
  readonly emptyContent?: ReactNode;
  readonly children: (data: Data) => ReactNode;
}

// Laden, fout, leeg en data op één plek (framework §5): features lezen nooit zelf isLoading of isError.
export function AsyncView<Data>({
  query,
  isEmpty,
  emptyText = uiTexts.empty,
  emptyContent,
  children,
}: AsyncViewProps<Data>) {
  const errorText = useErrorText();
  if (query.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {uiTexts.loading}
      </p>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-destructive">{errorText(query.error)}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {uiTexts.retry}
        </Button>
      </div>
    );
  }
  if (isEmpty?.(query.data) === true)
    return <>{emptyContent ?? <p className="text-sm text-muted-foreground">{emptyText}</p>}</>;
  return <>{children(query.data)}</>;
}
