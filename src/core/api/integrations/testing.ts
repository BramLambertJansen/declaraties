import { randomUUID } from 'node:crypto';
import { describe, test } from 'vitest';
import { z } from 'zod';
import { UserId } from '../../shared/ids.ts';
import { unsafeCast } from '../../shared/unsafe-cast.ts';
import type { Tx, WithUser } from '../db/types.ts';
import { readEnv } from '../env.ts';
import { AppError } from '../errors.ts';
import { guardWithUser, type OutboundLogEntry } from '../outbound/index.ts';
import { startFakePartner, type FakePartner, type FakeResponse, type FakeRoutes } from '../outbound/testing.ts';
import type { UpstreamCode } from '../outbound/types.ts';
import { readSwitch } from './index.ts';
import { registerIntegrations } from './register.ts';
import type { Adapter, IntegrationClient, IntegrationClientConfig, Integrations, SwitchReading } from './types.ts';

// Alleen voor testbestanden (dependency-cruiser: testing-alleen-in-tests): de contracttestfabriek van een koppeling (spec
// koppelingsvorm, ADR 0077 punt 6). Eén suite draait de adapter tegen de nep-partner (fake) of, met de hand en nooit in CI,
// tegen de testomgeving van de partner (live). Een melding noemt nooit een partnerbody.

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

export interface ContractDef<Port> {
  // Het register van de app (src/api/integrations/index.ts).
  readonly integrations: Integrations;
  // Gelijk aan de mapnaam, letterlijk.
  readonly name: string;
  readonly adapter: Adapter<Port>;
  readonly probe: {
    // Sleutel op de nep-partner, bijv. 'GET /items/i-1'.
    readonly route: string;
    // Uit fixtures/: status 2xx (of leeg), json een object of lijst van objecten.
    readonly ok: FakeResponse;
    // Eén poortaanroep die precies die route raakt.
    readonly run: (port: Port) => Promise<unknown>;
  };
  // Alleen in live-modus aangeroepen.
  readonly live: () => IntegrationClientConfig;
}

export interface ContractCase<Port> {
  readonly name: string;
  readonly fake: FakeRoutes;
  // Eigen expect; partner is null in live-modus.
  readonly run: (port: Port, partner: FakePartner | null) => Promise<void>;
  // Ook in de handmatige run (alleen vorm toetsen, geen vaste waarden).
  readonly live?: true;
}

export type ContractTarget = 'fake' | 'live';

export interface BuiltCase {
  readonly name: string;
  readonly run: () => Promise<void>;
}

const NAME = /^[a-z][a-z0-9-]*$/;
const SECRET = 'partner-geheim';
const ACTOR = { userId: UserId.parse('u-contracttest'), sessionStrength: 'password' } as const;
const TEST_TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;
const TARGET_ENV = z.object({ CONTRACT_LIVE: z.string().optional(), CI: z.string().optional() });

// --- Testlezing (OV-2): de echte readSwitch onder guardWithUser, met een stub-transactie zonder database. ---

async function testReading(name: string, enabled: boolean): Promise<SwitchReading> {
  const tx = unsafeCast<Tx>(
    { execute: () => Promise.resolve({ rows: [{ enabled }] }) },
    'testlezing: readIntegrationSwitch leest alleen rows[0].enabled',
  );
  const withUser: WithUser = async (_actor, work) => work(tx, { role: 'user' });
  return guardWithUser(withUser)(ACTOR, async (inner) => readSwitch(inner, name), { requestId: 'contract-lezing' });
}

const sequence = { next: 0 };

function nextRequestId(): string {
  sequence.next += 1;
  return `contract-${String(sequence.next)}-${randomUUID()}`;
}

// --- Doel kiezen (OV-5). ---

export function contractTarget(
  name: string,
  vars: { readonly CONTRACT_LIVE?: string | undefined; readonly CI?: string | undefined },
): ContractTarget {
  const live = vars.CONTRACT_LIVE;
  if (live === undefined || live === '') return 'fake';
  if (!NAME.test(live)) {
    throw new ContractError(`CONTRACT_LIVE ${JSON.stringify(live)} voldoet niet aan /^[a-z][a-z0-9-]*$/`);
  }
  if (vars.CI !== undefined && vars.CI !== '') {
    throw new ContractError('CONTRACT_LIVE met CI: de handmatige run nooit in CI');
  }
  return live === name ? 'live' : 'fake';
}

// --- Opbouwfouten, vóór elke aanroep. ---

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkProbe(name: string, ok: FakeResponse): void {
  const { status, json } = ok;
  if (status !== undefined && (status < 200 || status > 299)) {
    throw new ContractError(`contract ${name}: probe.ok.status ${String(status)} is geen 2xx`);
  }
  // Een lege lijst zou het generieke geval 'extra veld' vals groen maken: daar komt dan geen veld bij.
  const valid = isRecord(json) || (Array.isArray(json) && json.length > 0 && json.every((item) => isRecord(item)));
  if (!valid) throw new ContractError(`contract ${name}: probe.ok.json is geen object of niet-lege lijst van objecten`);
}

function checkCaseNames<Port>(name: string, cases: readonly ContractCase<Port>[]): void {
  const seen = new Set<string>(GENERIC.map((generic) => generic.name));
  for (const own of cases) {
    if (seen.has(own.name)) {
      throw new ContractError(`contract ${name}: casenaam ${JSON.stringify(own.name)} is dubbel of generiek`);
    }
    seen.add(own.name);
  }
}

function checkContract<Port>(contract: ContractDef<Port>, cases: readonly ContractCase<Port>[]): void {
  if (!contract.integrations.has(contract.name)) {
    throw new ContractError(`contract ${contract.name}: naam staat niet in het register`);
  }
  checkProbe(contract.name, contract.probe.ok);
  checkCaseNames(contract.name, cases);
}

// --- Eén geval draaien: verse testlezing, eigen requestId, nep-partner of live-client. ---

interface Session<Port> {
  readonly name: string;
  readonly port: Port;
  readonly partner: FakePartner;
  readonly lines: readonly OutboundLogEntry[];
  readonly requestId: string;
}

interface Setup {
  readonly routes: FakeRoutes;
  readonly enabled: boolean;
}

async function withFakeSession<Port>(
  contract: ContractDef<Port>,
  setup: Setup,
  work: (session: Session<Port>) => Promise<void>,
): Promise<void> {
  const { name } = contract;
  const partner = await startFakePartner(setup.routes);
  try {
    const lines: OutboundLogEntry[] = [];
    const integrations = registerIntegrations([{ name, hosts: ['127.0.0.1'], traits: TEST_TRAITS }]);
    const client = integrations.client(name, {
      baseUrl: partner.url,
      appEnv: 'test',
      timeoutMs: 250,
      budgetMs: 1000,
      maxAttempts: 1,
      log: (entry) => {
        lines.push(entry);
      },
    });
    const requestId = nextRequestId();
    const reading = await testReading(name, setup.enabled);
    await work({ name, port: contract.adapter(client)({ reading, requestId }), partner, lines, requestId });
  } finally {
    await partner.close();
  }
}

// --- Generieke gevallen (alleen fake-modus), elk op probe.route. ---

interface Generic {
  readonly name: string;
  readonly response: (ok: FakeResponse) => FakeResponse;
  readonly enabled: boolean;
  // null: probe.run slaagt.
  readonly code: UpstreamCode | null;
  readonly calls?: number;
  readonly logs?: true;
}

function withExtraField(ok: FakeResponse): FakeResponse {
  const extra = { contractExtraVeld: 'x' };
  const { json } = ok;
  if (Array.isArray(json))
    return { ...ok, json: json.map((item: unknown) => ({ ...(isRecord(item) ? item : {}), ...extra })) };
  return { ...ok, json: { ...(isRecord(json) ? json : {}), ...extra } };
}

const GENERIC: readonly Generic[] = [
  { name: 'geslaagd', response: (ok) => ok, enabled: true, code: null, calls: 1, logs: true },
  { name: 'extra veld', response: withExtraField, enabled: true, code: null },
  { name: 'uitgezet', response: (ok) => ok, enabled: false, code: 'UPSTREAM_UNAVAILABLE', calls: 0 },
  { name: 'time-out', response: (ok) => ({ ...ok, delayMs: 1000 }), enabled: true, code: 'UPSTREAM_TIMEOUT', calls: 1 },
  { name: 'niet bereikbaar', response: () => ({ destroy: true }), enabled: true, code: 'UPSTREAM_UNAVAILABLE' },
  {
    name: 'tijdelijk niet beschikbaar',
    response: () => ({ status: 503 }),
    enabled: true,
    code: 'UPSTREAM_UNAVAILABLE',
  },
  {
    name: 'serverfout',
    response: () => ({ status: 500, body: `{"error":"${SECRET}"}` }),
    enabled: true,
    code: 'UPSTREAM_UNAVAILABLE',
  },
  {
    name: 'geen JSON',
    response: () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'geen json' }),
    enabled: true,
    code: 'UPSTREAM_INVALID',
  },
  { name: 'ongeldig antwoord', response: () => ({ status: 200, json: 'x' }), enabled: true, code: 'UPSTREAM_INVALID' },
];

// Beschrijft een uitkomst zonder message van de fout: die kan een partnerbody bevatten.
function describeOutcome(error: unknown): string {
  if (error === null) return 'geen fout';
  if (error instanceof AppError) return `AppError ${error.code}`;
  if (error instanceof Error) return error.name;
  return typeof error;
}

// JSON.stringify geeft undefined bij undefined of een functie; een kringverwijzing gooit.
function serialized(error: unknown): string {
  try {
    const text: unknown = JSON.stringify(error);
    return typeof text === 'string' ? text : '';
  } catch {
    return '';
  }
}

function leaksSecret(error: unknown): boolean {
  if (error === null) return false;
  const message = error instanceof Error ? error.message : '';
  return message.includes(SECRET) || serialized(error).includes(SECRET);
}

// Wat afwijkt bij een generiek geval, of null als het klopt.
function genericProblem<Port>(generic: Generic, error: unknown, session: Session<Port>): string | null {
  const expected = generic.code === null ? 'geen fout' : `AppError ${generic.code}`;
  if (describeOutcome(error) !== expected) return `verwacht ${expected}, kreeg ${describeOutcome(error)}`;
  if (leaksSecret(error)) return 'de fout bevat de partnerbody';
  const count = session.partner.requests.length;
  if (generic.calls !== undefined && count !== generic.calls) {
    return `verwacht ${String(generic.calls)} aanroep(en), kreeg ${String(count)}`;
  }
  if (generic.logs !== true) return null;
  if (session.lines.length === 0) return 'geen logregel van de client';
  for (const line of session.lines) {
    if (line.outbound !== session.name) return `een logregel heeft outbound ${JSON.stringify(line.outbound)}`;
    if (line.requestId !== session.requestId) return 'een logregel heeft niet de requestId van het geval';
  }
  return null;
}

function runGeneric<Port>(contract: ContractDef<Port>, generic: Generic): BuiltCase {
  const { probe } = contract;
  const setup = { routes: { [probe.route]: generic.response(probe.ok) }, enabled: generic.enabled };
  return {
    name: generic.name,
    run: () =>
      withFakeSession(contract, setup, async (session) => {
        const error = await probe.run(session.port).then(
          () => null,
          (reason: unknown) => reason,
        );
        const problem = genericProblem(generic, error, session);
        if (problem !== null) {
          throw new ContractError(`contract ${contract.name}, geval ${JSON.stringify(generic.name)}: ${problem}`);
        }
      }),
  };
}

// --- Eigen gevallen en live-modus. ---

function ownFake<Port>(contract: ContractDef<Port>, own: ContractCase<Port>): BuiltCase {
  return {
    name: own.name,
    run: () =>
      withFakeSession(contract, { routes: own.fake, enabled: true }, (session) =>
        own.run(session.port, session.partner),
      ),
  };
}

function liveClient<Port>(contract: ContractDef<Port>, cases: readonly ContractCase<Port>[]): IntegrationClient {
  if (!cases.some((own) => own.live === true)) {
    throw new ContractError(`contract ${contract.name}: live-modus zonder geval met live: true`);
  }
  const config = contract.live();
  if (config.appEnv !== 'test') {
    throw new ContractError(`contract ${contract.name}: live() moet appEnv 'test' geven, niet '${config.appEnv}'`);
  }
  return contract.integrations.client(contract.name, config);
}

function ownLive<Port>(contract: ContractDef<Port>, own: ContractCase<Port>, client: IntegrationClient): BuiltCase {
  return {
    name: `live: ${own.name}`,
    run: async () => {
      const requestId = nextRequestId();
      const reading = await testReading(contract.name, true);
      await own.run(contract.adapter(client)({ reading, requestId }), null);
    },
  };
}

export function contractCases<Port>(
  contract: ContractDef<Port>,
  cases: readonly ContractCase<Port>[],
  target: ContractTarget,
): readonly BuiltCase[] {
  checkContract(contract, cases);
  if (target === 'live') {
    const client = liveClient(contract, cases);
    return cases.filter((own) => own.live === true).map((own) => ownLive(contract, own, client));
  }
  return [...GENERIC.map((generic) => runGeneric(contract, generic)), ...cases.map((own) => ownFake(contract, own))];
}

export function describeContract<Port>(contract: ContractDef<Port>, cases: readonly ContractCase<Port>[]): void {
  describe(`contract ${contract.name}`, () => {
    const target = contractTarget(contract.name, readEnv(TARGET_ENV));
    for (const entry of contractCases(contract, cases, target)) test(entry.name, entry.run);
  });
}
