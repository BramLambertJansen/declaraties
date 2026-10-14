import { useId, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';

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
