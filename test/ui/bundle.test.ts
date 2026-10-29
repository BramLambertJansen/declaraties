import path from 'node:path';
import { build, type Rolldown } from 'vite';
import { describe, expect, test } from 'vitest';

// Wat alleen in dev bestaat (src/web/dev: de rolwisselaar), zit niet in de productiebundel
// (framework §6; devOnlyModules in vite.config.ts). Bouwt in het geheugen, schrijft niets.
const root = path.join(import.meta.dirname, '../..');

type Chunk = { code: string; isEntry: boolean };

// Eén productiebuild voor alle tests in dit bestand.
let built: Promise<Chunk[]> | undefined;

async function buildChunks(): Promise<Chunk[]> {
  const result = await build({
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  return outputs.flatMap((output) =>
    output.output.map((chunk) =>
      chunk.type === 'chunk'
        ? { code: chunk.code, isEntry: chunk.isEntry }
        : { code: String(chunk.source), isEntry: false },
    ),
  );
}

function productionChunks(): Promise<Chunk[]> {
  built ??= buildChunks();
  return built;
}

describe('productiebundel', () => {
  test('bevat de rolwisselaar uit src/web/dev niet (spec accounts/AC-8)', async () => {
    const bundle = (await productionChunks()).map((chunk) => chunk.code).join('\n');

    expect(bundle).toContain('Inloggen');
    expect(bundle).not.toContain('Lokaal inloggen als');
    expect(bundle).not.toContain('Rol wisselen (alleen lokaal)');
  }, 30_000);

  test('bevat de catalogus ("Dialoog openen") in een andere chunk dan de entry-chunk (spec design-system/AC-6)', async () => {
    const chunks = await productionChunks();

    const withCatalogue = chunks.filter((chunk) => chunk.code.includes('Dialoog openen'));
    expect(withCatalogue.length).toBeGreaterThan(0);
    expect(withCatalogue.filter((chunk) => chunk.isEntry)).toStrictEqual([]);
    expect(chunks.some((chunk) => chunk.isEntry)).toBe(true);
  }, 30_000);
});
