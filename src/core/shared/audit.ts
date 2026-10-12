import type { z } from 'zod';
import { unsafeCast } from './unsafe-cast.ts';

export interface AuditActionDef {
  readonly target: string;
  readonly details: z.ZodObject;
}

export type AuditActions = Readonly<Record<string, AuditActionDef>>;

export type AuditAction<Audit extends AuditActions> = Extract<keyof Audit, string>;

export type AuditDetails<Audit extends AuditActions, A extends AuditAction<Audit>> = z.input<Audit[A]['details']>;

// Een auditregel in de transactie van de route (ADR 0021): alleen acties die de app met defineAuditActions registreerde.
export type AuditFn<Audit extends AuditActions = AuditActions> = <A extends AuditAction<Audit>>(
  action: A,
  targetId: string,
  details: AuditDetails<Audit, A>,
) => Promise<void>;

// Dezelfde patronen als de CHECK's op app.audit_log (spec audit-log, ADR 0021).
const ACTION_PATTERN = /^[a-z]+(\.[a-z_]+)+$/;
const TARGET_PATTERN = /^[a-z_]+$/;

// Een fout in de registratie gooit bij het aanmaken, dus bij het opstarten (zoals defineErrorCodes). `core.` en het doeltype
// `account` zijn voor core; de database weigert ze in app.audit ook (22023).
// `details` wordt strict geparsed: een onbekende sleutel faalt, zodat er niets ongeregistreerds in het log belandt.
export function defineAuditActions<const Map extends AuditActions>(map: Map): Map {
  const strict = Object.entries(map).map(([action, def]): [string, AuditActionDef] => {
    checkAction(action, def);
    return [action, { ...def, details: def.details.strict() }];
  });
  return unsafeCast<Map>(
    Object.fromEntries(strict),
    'dezelfde sleutels en doeltypen; alleen details is strict gemaakt',
  );
}

function checkAction(action: string, def: AuditActionDef): void {
  if (!ACTION_PATTERN.test(action)) {
    throw new Error(`defineAuditActions: actie '${action}' valt buiten ${String(ACTION_PATTERN)}`);
  }
  if (action.startsWith('core.')) {
    throw new Error(`defineAuditActions: actie '${action}': het voorvoegsel core. is van core`);
  }
  if (!TARGET_PATTERN.test(def.target) || def.target === 'account') {
    throw new Error(`defineAuditActions: doeltype '${def.target}' van '${action}' is ongeldig (account is van core)`);
  }
}
