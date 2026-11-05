import type { PoolClient } from 'pg';

// pg-pool bewaakt alleen idle clients. Tijdens een handler kan de uitgeleende client zonder actieve query wegvallen.
// Race ook dat event tegen het werk; de kapotte client wordt nooit opnieuw uitgeleend aan een andere actor.
export function watchClient(client: PoolClient) {
  let broken = false;
  const failure = Promise.withResolvers<never>();
  const onError = (error: Error) => {
    broken = true;
    failure.reject(error);
  };
  client.on('error', onError);
  return {
    run: <T>(work: () => Promise<T>): Promise<T> => Promise.race([failure.promise, work()]),
    broken: () => broken,
    release: (destroy: boolean) => {
      client.release(destroy || broken);
      client.off('error', onError);
    },
  };
}
