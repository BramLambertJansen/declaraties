// Readiness (roadmap stuk 7, framework §3): GET /api/ready zegt of de API de database bereikt, voor de load balancer
// of containerhost. Liveness blijft GET /api/health (geen afhankelijkheden). Het antwoord wordt kort bewaard en er
// loopt hooguit één controle tegelijk, zodat een publieke route de database niet kan belasten.

export interface ReadinessOptions {
  // Na deze tijd telt een controle als mislukt; de controle zelf mag doorlopen, maar er start geen tweede. De controle moet
  // daarom zelf begrensd zijn (pingDatabase is dat: verbinden en query elk 900 ms), anders blijft readiness op false.
  readonly timeoutMs: number;
  // Zolang geldt de vorige uitkomst.
  readonly cacheMs: number;
  // Monotone klok, zodat een klokcorrectie (NTP) de bewaartijd niet verlengt.
  readonly now?: () => number;
}

export type Readiness = () => Promise<boolean>;

function checkOutcome(check: () => Promise<void>): Promise<boolean> {
  try {
    return check().then(
      () => true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

function within(check: Promise<boolean>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
  });
  return Promise.race([check, timedOut]).finally(() => {
    clearTimeout(timer);
  });
}

export function createReadiness(check: () => Promise<void>, options: ReadinessOptions): Readiness {
  const now = options.now ?? (() => performance.now());
  let last: { readonly ok: boolean; readonly at: number } | undefined;
  let running: Promise<boolean> | undefined;
  let checking = false;

  async function run(): Promise<boolean> {
    checking = true;
    const outcome = checkOutcome(check);
    void outcome.finally(() => {
      checking = false;
    });
    const ok = await within(outcome, options.timeoutMs);
    last = { ok, at: now() };
    return ok;
  }

  return async () => {
    if (last !== undefined && now() - last.at < options.cacheMs) return last.ok;
    // Een vorige controle hangt nog (na de timeout): niet nog een verbinding openen.
    if (running === undefined && checking) return false;
    running ??= run().finally(() => {
      running = undefined;
    });
    return running;
  };
}
