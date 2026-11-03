import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Spec rolhek-dicht (ADR 0045 punt 3, herzien): het rolhek valt dicht als de stub niet start, crasht of zijn timeout haalt.
// Dat regelt `onFailure: "block"` op het hook-object van de PreToolUse-entry die `.claude/hooks/rolhek.mjs` start; op geen
// enkel ander hook-object, onder welk event ook (werkstraat, effect, meethook, melding blijven open bij storing).
const ROLHEK = '.claude/hooks/rolhek.mjs';

function child(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

function lijst(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasKey(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && Object.keys(value).includes(key);
}

function commandOf(hook: unknown): string {
  const command = child(hook, 'command');
  return typeof command === 'string' ? command : '';
}

interface HookPlek {
  readonly event: string;
  readonly entry: number;
  readonly hook: number;
  readonly command: string;
  readonly value: unknown;
}

function alleHooks(): HookPlek[] {
  const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  const events = child(settings, 'hooks');
  if (typeof events !== 'object' || events === null) return [];
  return Object.entries(events).flatMap(([event, entries]) =>
    lijst(entries).flatMap((entry, i) =>
      lijst(child(entry, 'hooks')).map((value, j) => ({ event, entry: i, hook: j, command: commandOf(value), value })),
    ),
  );
}

function rolhekEntry(): unknown {
  const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
  return lijst(child(child(settings, 'hooks'), 'PreToolUse')).find((entry) =>
    lijst(child(entry, 'hooks')).some((hook) => commandOf(hook).includes(ROLHEK)),
  );
}

test('rolhek-dicht/AC-1: de PreToolUse-entry van het rolhek heeft onFailure "block" op hooks[0]', () => {
  const eerste = lijst(child(rolhekEntry(), 'hooks'))[0];

  expect(commandOf(eerste)).toContain(ROLHEK);
  expect(child(eerste, 'onFailure')).toBe('block');
});

test('rolhek-dicht/AC-1: de test ziet hook-objecten onder elk event, ook buiten PreToolUse', () => {
  const events = new Set(alleHooks().map((plek) => plek.event));

  for (const event of ['PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop', 'SessionStart', 'Notification'])
    expect(events).toContain(event);
});

test('rolhek-dicht/AC-1: geen ander hook-object, onder welk event ook, heeft de sleutel onFailure', () => {
  const plekken = alleHooks();
  const rolhek = plekken.filter((plek) => plek.event === 'PreToolUse' && plek.command.includes(ROLHEK));
  const anderMet = plekken
    .filter((plek) => !rolhek.includes(plek) && hasKey(plek.value, 'onFailure'))
    .map((plek) => `${plek.event}[${String(plek.entry)}].hooks[${String(plek.hook)}] ${plek.command}`);

  expect(rolhek).toHaveLength(1);
  expect(plekken.length).toBeGreaterThan(rolhek.length);
  expect(anderMet).toStrictEqual([]);
});

test('rolhek-dicht/AC-1: de entry zelf (naast hooks) draagt geen onFailure', () => {
  expect(hasKey(rolhekEntry(), 'onFailure')).toBe(false);
});
