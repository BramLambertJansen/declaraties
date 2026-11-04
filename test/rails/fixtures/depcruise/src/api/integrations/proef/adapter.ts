import type { ProefPort } from './port.ts';
import { schema } from './schemas.ts';
export const adapter = (port: ProefPort | null) => [port, schema];
