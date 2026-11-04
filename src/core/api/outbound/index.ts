import type { z } from 'zod';
import { runCall } from './client.ts';
import { resolveConfig } from './config.ts';
import type { OutboundClient, OutboundConfig, OutboundRequest, OutboundResult } from './types.ts';

// Uitgaande client voor koppelingen met een partner (ADR 0077, spec uitgaande-client). Netwerk naar een externe dienst gaat
// alleen hierlangs (R-CODE-12). De app maakt per koppeling één client, in de compositie-root.

export { OutboundConfigError, OutboundForbiddenError, OutboundUsageError } from './errors.ts';
export { guardWithUser } from './marker.ts';
export type {
  OutboundClient,
  OutboundConfig,
  OutboundLog,
  OutboundLogEntry,
  OutboundMethod,
  OutboundRequest,
  OutboundResult,
} from './types.ts';

// Controleert de configuratie bij opstart (OutboundConfigError) en geeft de client terug.
export function createOutboundClient(config: OutboundConfig): OutboundClient {
  const target = resolveConfig(config);
  return {
    call: async <S extends z.ZodType, const E extends number = never>(
      request: OutboundRequest<S, E>,
    ): Promise<OutboundResult<S, E>> => runCall(target, request),
  };
}
