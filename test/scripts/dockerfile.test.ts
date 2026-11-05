import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// De productie-image (ADR 0049) loopt niet achter op de rest van de toolchain: dezelfde pnpm als packageManager, dezelfde
// Node als mise.toml, en dezelfde basisimage (op digest) als de runner in compose.yaml.
const read = (file: string) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const dockerfile = read('Dockerfile');

function match(source: string, pattern: RegExp): string {
  const found = pattern.exec(source)?.[1];
  if (found === undefined) throw new Error(`niet gevonden: ${String(pattern)}`);
  return found;
}

test('pnpm in de image = packageManager in package.json', () => {
  const packageManager = match(read('package.json'), /"packageManager": "pnpm@([^"]+)"/);
  expect(match(dockerfile, /pnpm@(\d[^\s]*)/)).toBe(packageManager);
});

test('Node in de image = mise.toml', () => {
  const node = match(read('mise.toml'), /^node = "([^"]+)"/m);
  expect(match(dockerfile, /ARG NODE_IMAGE=node:([\d.]+)-/)).toBe(node);
});

test('basisimage op digest, gelijk aan de runner in compose.yaml', () => {
  const image = match(dockerfile, /ARG NODE_IMAGE=(\S+)/);
  expect(image).toMatch(/@sha256:[0-9a-f]{64}$/);
  expect(read('compose.yaml')).toContain(`image: ${image}`);
});
