// Uitgaande client voor koppelingen met een partner (ADR 0077, spec uitgaande-client). Netwerk naar een externe dienst gaat
// alleen hierlangs (R-CODE-12). De app maakt per koppeling één client via het register (src/core/api/integrations, spec
// koppelingsregister); createOutboundClient zelf staat in create.ts en is alleen voor core.

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
