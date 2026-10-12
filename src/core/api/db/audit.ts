import { sql } from 'drizzle-orm';
import type { AuditActions, AuditFn } from '../../shared/audit.ts';
import type { Tx } from './types.ts';

// ctx.audit (ADR 0021, spec audit-log deel C): alleen een geregistreerde actie, details strict geparsed, dan app.audit in de
// eigen tx van de route, zodat de regel met de actie terugrolt. Het doeltype komt uit de registratie, niet van de aanroeper.
export function createAuditFn(tx: Tx, actions: AuditActions): AuditFn {
  return async (action, targetId, details) => {
    const def = actions[action];
    if (def === undefined) throw new Error(`ctx.audit: actie '${action}' is niet geregistreerd`);
    const parsed = def.details.parse(details);
    await tx.execute(sql`select app.audit(${action}, ${def.target}, ${targetId}, ${JSON.stringify(parsed)}::jsonb)`);
  };
}
