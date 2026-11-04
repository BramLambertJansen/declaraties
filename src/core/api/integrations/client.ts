import type { z } from 'zod';
import { AppError } from '../errors.ts';
import { createOutboundClient } from '../outbound/create.ts';
import { OutboundForbiddenError } from '../outbound/errors.ts';
import { safeLog, writeOutboundLine } from '../outbound/log.ts';
import { outboundForbidden } from '../outbound/marker.ts';
import { checkTemplate } from '../outbound/url.ts';
import type { OutboundRequest, OutboundResult } from '../outbound/types.ts';
import { assertReading } from './reading.ts';
import type { IntegrationClient, IntegrationClientConfig, IntegrationDef, SwitchReading } from './types.ts';

// De client van één koppeling (spec koppelingsregister, Volgorde in IntegrationClient.call), telkens zonder aanroep:
// 1) onder de markering OutboundForbiddenError; 2) een lezing die niet geldt OutboundUsageError; 3) stand uit
// eerst het padsjabloon zoals de gewone client (OutboundUsageError, geen logregel), daarna UPSTREAM_UNAVAILABLE met één
// logregel DISABLED; zo komt een query of geheim in het pad nooit in het log. Dan de gewone uitgaande client.
export function createIntegrationClient(def: IntegrationDef, config: IntegrationClientConfig): IntegrationClient {
  const outbound = createOutboundClient({ ...config, name: def.name, hosts: def.hosts });
  const log = config.log ?? writeOutboundLine;
  return {
    name: def.name,
    call: async <S extends z.ZodType, const E extends number = never>(
      reading: SwitchReading,
      request: OutboundRequest<S, E>,
    ): Promise<OutboundResult<S, E>> => {
      if (outboundForbidden()) {
        throw new OutboundForbiddenError('client.call: geen partneraanroep binnen withUser of afterCommit (R-CODE-12)');
      }
      assertReading(reading, def.name);
      if (!reading.enabled) {
        checkTemplate(request.path);
        safeLog(log, {
          time: new Date().toISOString(),
          requestId: request.requestId,
          outbound: def.name,
          method: request.method,
          path: request.path,
          status: null,
          durationMs: 0,
          attempt: 0,
          outcome: 'DISABLED',
          retry: false,
        });
        throw new AppError('UPSTREAM_UNAVAILABLE', { cause: undefined });
      }
      return outbound.call(request);
    },
  };
}
