import type { UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { uiTexts } from '../copy/ui.ts';
import { ApiError } from '../lib/api-client.ts';
import { Button } from './button.tsx';
import { useErrorText } from './error-texts.tsx';

interface AsyncViewProps<Data> {
  readonly query: UseQueryResult<Data> | UseInfiniteQueryResult<Data>;
  // Wanneer de data als leeg telt (bijv. een lege lijst); dan staat emptyText er in plaats van children.
  readonly isEmpty?: (data: Data) => boolean;
  readonly emptyText?: string;
  readonly emptyContent?: ReactNode;
  readonly refresh?: { readonly refreshingLabel: string; readonly staleLabel: string };
  readonly children: (data: Data) => ReactNode;
}

// Laden, fout, leeg en data op één plek (framework §5): features lezen nooit zelf isLoading of isError.
export function AsyncView<Data>({
  query,
  isEmpty,
  emptyText = uiTexts.empty,
  emptyContent,
  refresh,
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
  const retain =
    refresh !== undefined && query.data !== undefined && !(query.error instanceof ApiError && query.error.status < 500);
  if (query.isError && !retain) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm text-destructive">{errorText(query.error)}</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {uiTexts.retry}
        </Button>
      </div>
    );
  }
  if (query.data === undefined) return null;
  return (
    <>
      {refresh === undefined ? null : (
        <div className="flex flex-col items-start gap-2">
          <p role="status" className="text-sm text-muted-foreground">
            {query.isFetching ? refresh.refreshingLabel : ''}
          </p>
          {query.isError ? (
            <div role="alert" className="flex flex-col items-start gap-2">
              <p>
                {refresh.staleLabel} {errorText(query.error)}
              </p>
              <Button variant="outline" busy={query.isFetching} onClick={() => void query.refetch()}>
                {uiTexts.retry}
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {isEmpty?.(query.data) === true
        ? (emptyContent ?? <p className="text-sm text-muted-foreground">{emptyText}</p>)
        : children(query.data)}
    </>
  );
}
