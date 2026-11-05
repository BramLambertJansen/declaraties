import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client.ts';

export interface QueryClientConfig {
  // Een 401 uit een query of mutatie (framework §5: 401 → naar inloggen). De app koppelt hier de navigatie naar /login.
  readonly onUnauthenticated?: () => void;
}

const MAX_RETRIES = 2;

// Een partnerfout herhaalt de server al binnen zijn budget, en elke herhaling kost een duur-telling (spec partnerstap OV-5).
const UPSTREAM_CODES: readonly string[] = ['UPSTREAM_INVALID', 'UPSTREAM_UNAVAILABLE', 'UPSTREAM_TIMEOUT'];

// Een fout van de client zelf (4xx) of een partnerfout (UPSTREAM_*) wordt niet herhaald; een netwerk- of andere
// serverfout hooguit twee keer.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status < 500 || UPSTREAM_CODES.includes(error.code))) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') config.onUnauthenticated?.();
  };
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: { queries: { retry: shouldRetry, staleTime: 30_000 }, mutations: { retry: false } },
  });
}
