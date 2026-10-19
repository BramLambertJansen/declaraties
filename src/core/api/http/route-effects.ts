type Effect = () => Promise<unknown>;

async function cleanUp(effect: Effect): Promise<void> {
  try {
    await effect();
  } catch (error) {
    console.error('route: cleanup na rollback mislukt', error);
  }
}

// De transactionele grens ligt bij withUser: de callbacks raken nooit een nog open app-transactie of uitgeleende client.
// Rollback-cleanup loopt in omgekeerde volgorde; een fout daarin verbergt de oorspronkelijke fout niet.
export function createRouteEffects() {
  const committed: Effect[] = [];
  const rolledBack: Effect[] = [];
  let failed = false;
  return {
    afterCommit: (effect: Effect): void => {
      if (!failed) committed.push(effect);
    },
    afterRollback: (effect: Effect): void => {
      // Een externe stap kan na een disconnect nog afronden: registreer ook dan geen verloren compensatie.
      if (failed) void cleanUp(effect);
      else rolledBack.push(effect);
    },
    async run<T>(transaction: () => Promise<T>): Promise<T> {
      let result: T;
      try {
        result = await transaction();
      } catch (error) {
        failed = true;
        for (const cleanup of rolledBack.toReversed()) await cleanUp(cleanup);
        throw error;
      }
      // Een fout na commit mag nooit rollback-compensatie uitvoeren op reeds gecommitteerde data.
      const outcomes = await Promise.allSettled(committed.map(async (effect) => effect()));
      const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
      if (rejected?.status === 'rejected') throw rejected.reason;
      return result;
    },
  };
}
