import type { z } from 'zod';
import { runCall } from './client.ts';
import { resolveConfig } from './config.ts';
import type { OutboundClient, OutboundConfig, OutboundRequest, OutboundResult } from './types.ts';

// Maakt een uitgaande client (spec uitgaande-client). Alleen binnen src/core/api (depcruise uitgaande-client-alleen-in-core):
// de app maakt haar clients via het register, integrations.client (spec koppelingsregister), zodat naam en hosts één bron
// hebben en de schakelaar altijd geldt.

// Controleert de configuratie bij opstart (OutboundConfigError) en geeft de client terug.
export function createOutboundClient(config: OutboundConfig): OutboundClient {
  const target = resolveConfig(config);
  return {
    call: async <S extends z.ZodType, const E extends number = never>(
      request: OutboundRequest<S, E>,
    ): Promise<OutboundResult<S, E>> => runCall(target, request),
  };
}
