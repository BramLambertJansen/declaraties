import { useQuery } from '@tanstack/react-query';

// Alleen lokale voorbeelddata; deze query doet geen API-aanroep (design-system/AC-10).
export function useExampleQuery() {
  return useQuery({ queryKey: ['design-system', 'example'], queryFn: () => Promise.resolve(['Voorbeeld geladen.']) });
}

export function useEmptyExampleQuery() {
  return useQuery({ queryKey: ['design-system', 'empty'], queryFn: () => Promise.resolve<string[]>([]) });
}
