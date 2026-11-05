import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { build, type Rolldown } from 'vite';
import { expect, test } from 'vitest';
import { bundleBudgetKb } from '../../src/web/bundle-budget.ts';

// Bundelbudget (roadmap stuk 4): de productiebundel groeit niet ongemerkt. Gemeten met gzip, zoals een browser hem ophaalt,
// en per scherm: de entry plus de chunks van die route (statische closure, elke chunk één keer geteld; routes onder `_app/`
// laden ook de layout mee). Gecontroleerd worden de entry, het zwaarste gewone scherm, /design-system apart, /login boven de
// entry (legt de winst van `sideEffects` vast), de grootste chunk en de CSS.
// De getallen staan in src/web/bundle-budget.ts (van de app: ophogen zonder deze beschermde test te raken).
// Er is bewust geen totaalplafond voor alle JS: dat groeit met elk scherm (circa 15 kB per resource) en maakt de bundel rood
// terwijl geen enkel scherm zwaarder werd; een browser laadt nooit alle schermen tegelijk.
const BUDGET_KB = bundleBudgetKb;
const CATALOGUS = 'routes/_app/design-system';
const LOGIN = 'src/web/routes/login.tsx';
const LAYOUT = 'src/web/routes/_app.tsx';
const LAYOUT_DIR = 'src/web/routes/_app/';
const root = path.join(import.meta.dirname, '../..');

type Asset = Rolldown.OutputChunk | Rolldown.OutputAsset;

async function productionAssets(): Promise<Asset[]> {
  const result = await build({
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'production',
    logLevel: 'silent',
    build: { write: false },
    // Vitest zet NODE_ENV=test; zonder dit meet de test de ontwikkelversie van React.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  });
  const outputs: Rolldown.RolldownOutput[] = Array.isArray(result) ? result : 'output' in result ? [result] : [];
  return outputs.flatMap((output) => output.output);
}

const gzipKb = (asset: Asset) => gzipSync(asset.type === 'chunk' ? asset.code : asset.source).length / 1024;

/** Chunk plus alles wat hij statisch importeert (dynamische imports tellen niet: die laadt een browser later). */
function staticClosure(start: Rolldown.OutputChunk, chunks: ReadonlyMap<string, Rolldown.OutputChunk>) {
  const seen = new Set<string>();
  const visit = (chunk: Rolldown.OutputChunk) => {
    if (seen.has(chunk.fileName)) return;
    seen.add(chunk.fileName);
    for (const name of chunk.imports) {
      const next = chunks.get(name);
      if (next) visit(next);
    }
  };
  visit(start);
  return seen;
}

const sumKb = (names: ReadonlySet<string>, sizes: ReadonlyMap<string, number>) =>
  [...names].reduce((total, name) => total + (sizes.get(name) ?? 0), 0);

type Route = { label: string; kb: number };

function routeCosts(assets: Asset[]) {
  const chunks = new Map(assets.flatMap((asset) => (asset.type === 'chunk' ? [[asset.fileName, asset] as const] : [])));
  const sizes = new Map(assets.map((asset) => [asset.fileName, gzipKb(asset)] as const));
  const js = [...chunks.values()];
  const entry = js.find((chunk) => chunk.isEntry);
  const labelOf = (chunk: Rolldown.OutputChunk) =>
    chunk.facadeModuleId ? path.relative(root, chunk.facadeModuleId) : chunk.name;
  const layout = js.find(
    (chunk) => chunk.isDynamicEntry && labelOf(chunk).replace('?tsr-split=component', '') === LAYOUT,
  );
  const entryFiles = entry ? staticClosure(entry, chunks) : new Set<string>();
  const routes: Route[] = js
    .filter((chunk) => chunk.isDynamicEntry)
    .map((chunk) => {
      const label = labelOf(chunk);
      // Een route onder `_app/` laadt ook de layout-chunk `_app.tsx`; die telt dus mee.
      const extra = label.startsWith(LAYOUT_DIR) && layout ? staticClosure(layout, chunks) : new Set<string>();
      return { label, kb: sumKb(new Set([...entryFiles, ...extra, ...staticClosure(chunk, chunks)]), sizes) };
    });
  const largest = js.reduce<Route>(
    (max, chunk) =>
      (sizes.get(chunk.fileName) ?? 0) > max.kb ? { label: chunk.fileName, kb: sizes.get(chunk.fileName) ?? 0 } : max,
    { label: '-', kb: 0 },
  );
  const sumOf = (list: readonly Asset[]) => list.reduce((total, asset) => total + (sizes.get(asset.fileName) ?? 0), 0);
  return {
    entry,
    layout,
    routes,
    largest,
    entryKb: sumKb(entryFiles, sizes),
    cssKb: sumOf(assets.filter((asset) => asset.fileName.endsWith('.css'))),
  };
}

test('de productiebundel blijft binnen het budget', async () => {
  const { entry, layout, routes, largest, entryKb, cssKb } = routeCosts(await productionAssets());
  const catalogus = routes.find((route) => route.label.includes(CATALOGUS));
  const login = routes.find((route) => route.label.replace('?tsr-split=component', '') === LOGIN);
  expect(entry, 'entry-chunk').toBeDefined();
  expect(layout, 'layout-chunk _app.tsx').toBeDefined();
  expect(catalogus, 'route-chunk /design-system').toBeDefined();
  expect(login, 'route-chunk /login').toBeDefined();
  const heaviest = routes
    .filter((route) => !route.label.includes(CATALOGUS))
    .reduce((max, route) => (route.kb > max.kb ? route : max), { label: '-', kb: 0 });

  expect(entryKb, 'entry-closure (kB gzip)').toBeLessThanOrEqual(BUDGET_KB.entry);
  expect(heaviest.kb, `zwaarste route ${heaviest.label}, entry plus layout plus route (kB gzip)`).toBeLessThanOrEqual(
    BUDGET_KB.zwaarsteRoute,
  );
  expect(
    catalogus?.kb,
    `route ${catalogus?.label ?? CATALOGUS}, entry plus layout plus route (kB gzip)`,
  ).toBeLessThanOrEqual(BUDGET_KB.catalogus);
  expect((login?.kb ?? 0) - entryKb, `/login boven de entry (kB gzip)`).toBeLessThanOrEqual(BUDGET_KB.loginBovenEntry);
  expect(largest.kb, `grootste chunk ${largest.label} (kB gzip)`).toBeLessThanOrEqual(BUDGET_KB.grootsteChunk);
  expect(cssKb, 'CSS totaal (kB gzip)').toBeLessThanOrEqual(BUDGET_KB.css);
}, 30_000);
