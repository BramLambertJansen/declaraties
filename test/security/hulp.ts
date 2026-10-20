import { type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../../src/core/api/db/types.ts';
import type { Method } from '../../src/core/shared/contract.ts';
import type { Antwoord } from './fixtures.ts';

// Kleine hulpfuncties van de eigenaarschapscontroles (spec security-suite, AC-8 t/m AC-13). Alleen testcode.

const rijenSchema = z.array(z.record(z.string(), z.unknown()));

// De rijen van één statement in de transactie van de testkit.
export async function rijenVan(tx: Tx, statement: SQL): Promise<Record<string, unknown>[]> {
  const result = await tx.execute(statement);
  return rijenSchema.parse(result.rows);
}

const PG_CODE = /^[0-9A-Z]{5}$/;

// De SQLSTATE van een databasefout, ook als de testkit hem in een AppError of Drizzle-fout heeft verpakt.
export function pgCode(error: unknown): string | undefined {
  let huidig: unknown = error;
  for (let diepte = 0; diepte < 4 && typeof huidig === 'object' && huidig !== null; diepte += 1) {
    if ('code' in huidig && typeof huidig.code === 'string' && PG_CODE.test(huidig.code)) return huidig.code;
    huidig = 'cause' in huidig ? huidig.cause : undefined;
  }
  return undefined;
}

export const foutTekst = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const methodSchema = z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

// 'POST /probes/:id' wordt { method, pad }.
export function splitsLabel(label: string): { readonly method: Method; readonly pad: string } {
  const [method, pad] = label.split(' ');
  return { method: methodSchema.parse(method), pad: z.string().startsWith('/').parse(pad) };
}

export const padParameters = (pad: string): string[] =>
  [...pad.matchAll(/:([A-Za-z0-9_]+)/g)].flatMap((gevonden) => (gevonden[1] === undefined ? [] : [gevonden[1]]));

const codeSchema = z.object({ code: z.string() });

export function codeVan(antwoord: Antwoord): string | undefined {
  const gelezen = codeSchema.safeParse(antwoord.json);
  return gelezen.success ? gelezen.data.code : undefined;
}

// Het antwoord zonder requestId (dat verschilt per verzoek): voor "zelfde antwoord als voor een onbekend id".
export function zonderRequestId(antwoord: Antwoord): unknown {
  const gelezen = z.record(z.string(), z.unknown()).safeParse(antwoord.json);
  if (!gelezen.success) return antwoord.json;
  return Object.fromEntries(Object.entries(gelezen.data).filter(([naam]) => naam !== 'requestId'));
}
