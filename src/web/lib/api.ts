import { createApiClient } from '#core/web/lib/api-client.ts';
import type { Contracts } from '#shared/contracts/index.ts';

export const api = createApiClient<Contracts>();
