import { useId, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

// Handmatig afronden maakt refetchtoestanden bereikbaar zonder timers of netwerkmocks.
export function useRefreshExampleQuery() {
  const instance = useId();
  const release = useRef<{ resolve: (data: string[]) => void; reject: (error: Error) => void } | null>(null);
  useEffect(
    () => () => {
      release.current?.reject(new Error('Voorbeeld gesloten'));
    },
    [],
  );
  const query = useQuery({
    queryKey: ['design-system', 'refresh', instance],
    initialData: ['Bestaande gegevens'],
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: () =>
      new Promise<string[]>((resolve, reject) => {
        release.current = { resolve, reject };
      }),
  });
  const finish = (fail: boolean) => {
    if (fail) release.current?.reject(new Error('Voorbeeldfout'));
    else release.current?.resolve(['Vernieuwde gegevens']);
    release.current = null;
  };
  return { query, finish };
}

// Alleen lokale voorbeelddata; deze queries doen geen API-aanroep (design-system/AC-10).
export function useEmptyExampleQuery() {
  return useQuery({ queryKey: ['design-system', 'empty'], queryFn: () => Promise.resolve<string[]>([]) });
}

// Iedere instantie/keuze heeft een eigen lokale query; laden blijft staan, de eerste fout kan met retry herstellen.
export function useStateExampleQuery(mode: string, run: number) {
  const instance = useId();
  const failedRun = useRef<number | null>(null);
  return useQuery({
    queryKey: ['design-system', 'states', instance, mode, run],
    enabled: mode !== 'loading',
    retry: false,
    retryOnMount: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    gcTime: 0,
    queryFn: () => {
      if (mode === 'error' && failedRun.current !== run) {
        failedRun.current = run;
        throw new Error('Voorbeeldfout');
      }
      return Promise.resolve(mode === 'empty' ? [] : ['Voorbeeld geladen.']);
    },
  });
}
