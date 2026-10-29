import { logUnexpectedError } from '../http/safe-error-log.ts';
import type { TransactionOutcome, WithUserOptions } from './types.ts';

// Een waarnemer mag een gecommitteerd resultaat of de oorspronkelijke fout niet vervangen.
export function reportTransactionOutcome(options: WithUserOptions, outcome: TransactionOutcome): void {
  try {
    options.onTransactionOutcome?.(outcome);
  } catch (error) {
    logUnexpectedError({ requestId: options.requestId, label: 'database: transactie-uitkomstobserver mislukt' }, error);
  }
}
