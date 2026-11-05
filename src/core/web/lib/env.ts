import type { z } from 'zod';

// Enige plek met import.meta.env (framework §4). Alleen publieke waarden: een app-schema mag alleen VITE_-sleutels hebben.
export const isDev: boolean = import.meta.env.DEV;

export function readWebEnv<Schema extends z.ZodObject>(
  schema: Schema,
  source: object = import.meta.env,
): z.output<Schema> {
  const secret = Object.keys(schema.shape).filter((key) => !key.startsWith('VITE_'));
  if (secret.length > 0) {
    throw new Error(`readWebEnv: alleen VITE_-variabelen in de browser, niet ${secret.join(', ')} (framework §6)`);
  }
  return schema.parse(source);
}
