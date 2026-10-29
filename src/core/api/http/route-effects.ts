import { logUnexpectedError } from './safe-error-log.ts';
import type { TransactionOutcome } from '../db/types.ts';

type Effect = () => Promise<unknown>;
type LogContext = Parameters<typeof logUnexpectedError>[0];

async function cleanUp(effect: Effect, context: LogContext): Promise<void> {
  try {
    await effect();
  } catch (error) {
    logUnexpectedError({ ...context, label: 'route: cleanup na rollback mislukt' }, error);
  }
}

// De transactionele grens ligt bij withUser: de callbacks raken nooit een nog open app-transactie of uitgeleende client.
// Rollback-cleanup loopt in omgekeerde volgorde; een fout daarin verbergt de oorspronkelijke fout niet.
export function createRouteEffects(context: LogContext = {}) {
  const committed: Effect[] = [];
  const rolledBack: Effect[] = [];
  let failed = false;
  let outcome: TransactionOutcome = 'unknown';
  let failure: unknown;
  const unknown = () => {
    logUnexpectedError({ ...context, label: 'route: onbekende transactie-uitkomst, cleanup overgeslagen' }, failure);
  };
  return {
    onTransactionOutcome: (value: TransactionOutcome): void => {
      outcome = value;
    },
    afterCommit: (effect: Effect): void => {
      if (!failed) committed.push(effect);
    },
    afterRollback: (effect: Effect): void => {
      // Een externe stap kan na een disconnect nog afronden: registreer ook dan geen verloren compensatie.
      if (failed && outcome === 'rolledBack') void cleanUp(effect, context);
      else if (failed && outcome === 'unknown') unknown();
      else rolledBack.push(effect);
    },
    async run<T>(transaction: () => Promise<T>): Promise<T> {
      let result: T;
      try {
        result = await transaction();
      } catch (error) {
        failed = true;
        failure = error;
        if (outcome === 'rolledBack') {
          for (const cleanup of rolledBack.toReversed()) await cleanUp(cleanup, context);
        } else if (outcome === 'unknown' && (rolledBack.length > 0 || committed.length > 0)) unknown();
        throw error;
      }
      outcome = 'committed';
      // Een fout na commit mag nooit rollback-compensatie uitvoeren op reeds gecommitteerde data.
      const outcomes = await Promise.allSettled(committed.map(async (effect) => effect()));
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      return result;
    },
  };
}
