import type { z } from 'zod';
import type { Permissions } from './can.ts';
import type { RateLimitCategory } from './limits.ts';

// Route-contracten (framework §8 "Contract"; ADR 0008): methode, pad, input, output en permissie, zonder handler. Ze staan in
// src/shared, zodat de web-client ze kan lezen zonder iets uit src/api te importeren; de API koppelt er met defineRoute een
// handler aan.
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Contract<
  M extends Method = Method,
  P extends string = string,
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodType = z.ZodType,
  Permission extends string = string,
> {
  readonly method: M;
  readonly path: P;
  readonly input: I;
  readonly output: O;
  readonly permission: Permission;
  // Categorie van de rate limit (spec rate-limit); zonder: GET → lezen, anders schrijven. Uitzetten kan niet.
  readonly rateLimit?: RateLimitCategory;
}

export function rateLimitCategory(contract: Pick<Contract, 'method' | 'rateLimit'>): RateLimitCategory {
  return contract.rateLimit ?? (contract.method === 'GET' ? 'lezen' : 'schrijven');
}

function isStrict(schema: z.ZodObject): boolean {
  return schema.def.catchall?._zod.def.type === 'never';
}

// Input is altijd .strict() (AGENTS.md: onbekende velden zijn een fout); het pad begint met / en bevat geen /api.
export function createContracts<Permission extends string>(permissions: Permissions<Permission>) {
  return {
    defineContract: <const M extends Method, const P extends `/${string}`, I extends z.ZodObject, O extends z.ZodType>(
      contract: Contract<M, P, I, O, Permission>,
    ): Contract<M, P, I, O, Permission> => {
      if (!isStrict(contract.input)) throw new Error(`${contract.method} ${contract.path}: input moet .strict() zijn`);
      if (contract.path.startsWith('/api'))
        throw new Error(`${contract.path}: pad zonder /api (createApp zet dat ervoor)`);
      if (!permissions.names.includes(contract.permission)) {
        throw new Error(`${contract.method} ${contract.path}: onbekende permissie '${contract.permission}'`);
      }
      return Object.freeze({ ...contract });
    },
  };
}
