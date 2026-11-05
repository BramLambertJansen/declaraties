import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { switchIntegration } from '../../scripts/integration-switch.mjs';
import { beginTestDb, createPool, type TestDb } from '../../src/core/api/db/testing.ts';
import { readSwitch, registerIntegrations, type IntegrationClient } from '../../src/core/api/integrations/index.ts';
import { guardWithUser } from '../../src/core/api/outbound/index.ts';
import { startFakePartner, type FakePartner } from '../../src/core/api/outbound/testing.ts';
import { required } from '../auth/harness.ts';

// Spec koppelingsregister, het script `pnpm integration:switch --name <naam> --on|--off` (OV-7, OV-8): AC-4 (aan, daarna
// uit via het script; een nieuwe lezing plus call doet geen aanroep) en AC-10 (een onbekende naam stopt met een melding,
// zonder databasewijziging). Het script schrijft echt (eigen verbinding als app_migrator, committed); daarom krijgt elke
// run eigen namen, en een rij voor een naam buiten het register wordt genegeerd (spec, Randgevallen).
// Aanname voor de developer: scripts/integration-switch.mjs exporteert
// `switchIntegration(pool, integrations, { name, enabled })` en draait de CLI alleen onder `import.meta.main`.

const root = path.resolve(import.meta.dirname, '../..');
const migratorUrl = required('MIGRATOR_DATABASE_URL');
const testPool = createPool(migratorUrl);
const migrator = new pg.Pool({ connectionString: migratorUrl, max: 2 });
afterAll(async () => {
  await Promise.all([testPool.end(), migrator.end()]);
});

const TRAITS = {
  auth: 'none',
  direction: ['read'],
  cadence: ['on-demand'],
  sensitivity: 'normal',
  cost: 'free',
  source: 'partner',
} as const;

const ping = { requestId: 'r-script', method: 'GET', path: '/ping', schema: z.object({ id: z.string() }) } as const;
const pong = { ok: true, status: 200, data: { id: 'pong' } };

const uniqueName = (prefix: string): string => `${prefix}-${randomUUID().slice(0, 8)}`;

async function rowsFor(name: string): Promise<{ switches: unknown[]; audit: unknown[] }> {
  const switches = await migrator.query('select name, enabled from app.integration_switches where name = $1', [name]);
  const audit = await migrator.query(
    `select action, actor_id, db_role, target_type, target_id, details from app.audit_log
     where target_type = 'integration' and target_id = $1 order by id`,
    [name],
  );
  return { switches: switches.rows, audit: audit.rows };
}

let db: TestDb;
let partner: FakePartner;
beforeEach(async () => {
  db = await beginTestDb(testPool);
  partner = await startFakePartner({ 'GET /ping': { status: 200, json: { id: 'pong' } } });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await partner.close();
  await db.rollback();
});

describe('koppelingsregister/AC-4: aan, daarna uit via het script', () => {
  test('koppelingsregister/AC-4: na uit via het script doet een nieuwe lezing plus call geen aanroep; een auditregel per wijziging', async () => {
    const name = uniqueName('ac4');
    const integrations = registerIntegrations([{ name, hosts: ['127.0.0.1'], traits: TRAITS }]);
    const client: IntegrationClient = integrations.client(name, {
      baseUrl: partner.url,
      appEnv: 'test',
      log: () => undefined,
    });
    const user = await db.asUser('user');
    const guarded = guardWithUser(db.withUser);
    const read = async () => guarded(user.actor, async (tx) => readSwitch(tx, name), { requestId: 'r-ac4' });

    await switchIntegration(migrator, integrations, { name, enabled: true });
    const on = await read();
    expect(on.enabled).toBe(true);
    expect(await client.call(on, ping)).toStrictEqual(pong);
    expect(partner.calls('GET /ping')).toBe(1);

    await switchIntegration(migrator, integrations, { name, enabled: false });
    const off = await read();
    expect(off.enabled).toBe(false);
    await expect(client.call(off, ping)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(partner.calls('GET /ping')).toBe(1);

    // Randgeval (OV-3): de oude lezing (aan) geldt nog tot de grens.
    expect(await client.call(on, ping)).toStrictEqual(pong);
    expect(partner.calls('GET /ping')).toBe(2);

    // OV-7: de auditregels dragen db_role app_migrator en geen actor.
    expect(await rowsFor(name)).toStrictEqual({
      switches: [{ name, enabled: false }],
      audit: [
        {
          action: 'core.integration.enable',
          actor_id: null,
          db_role: 'app_migrator',
          target_type: 'integration',
          target_id: name,
          details: {},
        },
        {
          action: 'core.integration.disable',
          actor_id: null,
          db_role: 'app_migrator',
          target_type: 'integration',
          target_id: name,
          details: {},
        },
      ],
    });
  });
});

describe('koppelingsregister/AC-10: het script met een onbekende naam', () => {
  test('koppelingsregister/AC-10: switchIntegration met een naam buiten het register gooit met de naam, zonder query', async () => {
    const name = uniqueName('ac10');
    const integrations = registerIntegrations([{ name: uniqueName('bekend'), hosts: ['127.0.0.1'], traits: TRAITS }]);
    const query = vi.spyOn(migrator, 'query');

    const error = await switchIntegration(migrator, integrations, { name, enabled: true }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error instanceof Error ? error.message : '').toContain(name);
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
    expect(await rowsFor(name)).toStrictEqual({ switches: [], audit: [] });
  });

  test('koppelingsregister/AC-10: de CLI met een naam buiten het register (template: leeg) stopt met een melding, zonder databasewijziging', async () => {
    const name = uniqueName('ac10-cli');
    const run = promisify(execFile);

    const outcome = await run(process.execPath, ['scripts/integration-switch.mjs', '--name', name, '--on'], {
      cwd: root,
      env: { ...process.env, MIGRATOR_DATABASE_URL: migratorUrl },
      timeout: 20_000,
    }).then(
      () => ({ code: 0, stderr: '' }),
      (error: unknown) => ({
        code: error instanceof Error && 'code' in error && typeof error.code === 'number' ? error.code : -1,
        stderr: error instanceof Error && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '',
      }),
    );

    expect(outcome.code).toBeGreaterThan(0);
    expect(outcome.stderr).toContain(name);
    expect(await rowsFor(name)).toStrictEqual({ switches: [], audit: [] });
  }, 30_000);
});
