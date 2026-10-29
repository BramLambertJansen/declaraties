import { existsSync } from 'node:fs';
import { expect, test } from 'vitest';
import { branch, cli, fixture, json, log, stuur, veld } from './meting-semantiek-kit';

// Alleen de hieronder aangeleverde events worden getest; dit bewijst geen eventdekking door een runtime.
// De gh-stub is procesisolatie voor het CLI-script; hook en overzicht zijn de echte scripts.
test.each(['PostToolUse', 'PostToolUseFailure'])(
  'onafgeronde PreToolUse is een bovengrens: %s rondt de eigen meting af',
  (afronding) => {
    const f = fixture();
    stuur(f, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_use_id: 'docker',
      tool_input: { command: 'docker inspect geheim-argument' },
    });
    stuur(f, {
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_use_id: 'overzicht',
      tool_input: { command: 'pnpm meting --json' },
    });
    const eerste = json(f);
    expect(eerste).toMatchObject({
      sessies: {
        sessie: {
          weigeringen: 2,
          weigeringenPerSleutel: { docker: 1, 'pnpm meting': 1 },
          branches: { 'feat/een': { weigeringen: 2 } },
          ciRondes: 0,
        },
      },
    });
    const voor = log(f);
    expect(json(f)).toStrictEqual(eerste);
    expect(log(f)).toBe(voor);
    stuur(f, {
      hook_event_name: afronding,
      tool_name: 'Bash',
      tool_use_id: 'overzicht',
      tool_input: { command: 'pnpm meting --json' },
    });
    expect(json(f)).toMatchObject({
      sessies: {
        sessie: {
          weigeringen: 1,
          weigeringenPerSleutel: { docker: 1 },
          branches: { 'feat/een': { weigeringen: 1 } },
        },
      },
    });
    expect(existsSync(f.sentinel)).toBe(true);
  },
);

test('eigenaarberichten na de eerste opdracht zijn geen permissievragen of bewijs van een modus', () => {
  const f = fixture();
  for (const permission_mode of ['auto', 'plan', 'default'])
    stuur(f, { hook_event_name: 'UserPromptSubmit', permission_mode, prompt: 'GEHEIME_EIGENAARTEKST' });

  const uit = json(f);
  expect(uit).toMatchObject({
    sessies: {
      sessie: {
        eigenaarberichten: 2,
        prompts: 0,
        promptsPerModus: {},
        branches: { 'feat/een': { eigenaarberichten: 2, prompts: 0, promptsPerModus: {} } },
      },
    },
  });
  expect(veld(uit, 'sessies', 'sessie', 'promptsPerModus')).toStrictEqual({});
  expect(veld(uit, 'sessies', 'sessie', 'branches', 'feat/een', 'promptsPerModus')).toStrictEqual({});
  expect(log(f)).not.toContain('GEHEIME_EIGENAARTEKST');
});

test('alleen PermissionRequest telt modi, met ontbrekende modus als onbekend, ook per branch', () => {
  const f = fixture();
  for (const permission_mode of ['auto', 'auto', 'default'])
    stuur(f, { hook_event_name: 'PermissionRequest', permission_mode, tool_name: 'Read' });
  branch(f, 'feat/twee');
  stuur(f, { hook_event_name: 'PermissionRequest', permission_mode: 'plan', tool_name: 'Read' });
  stuur(f, { hook_event_name: 'PermissionRequest', tool_name: 'Read' });
  stuur(f, { hook_event_name: 'Stop', permission_mode: 'bypassPermissions' });

  const uit = json(f);
  expect(uit).toMatchObject({
    sessies: {
      sessie: {
        prompts: 5,
        promptsPerModus: { auto: 2, default: 1, plan: 1, onbekend: 1 },
        branches: {
          'feat/een': { prompts: 3, promptsPerModus: { auto: 2, default: 1 } },
          'feat/twee': { prompts: 2, promptsPerModus: { plan: 1, onbekend: 1 } },
        },
      },
    },
  });
  expect(veld(uit, 'sessies', 'sessie', 'promptsPerModus')).toStrictEqual({
    auto: 2,
    default: 1,
    plan: 1,
    onbekend: 1,
  });
  expect(veld(uit, 'sessies', 'sessie', 'branches', 'feat/een', 'promptsPerModus')).toStrictEqual({
    auto: 2,
    default: 1,
  });
  expect(veld(uit, 'sessies', 'sessie', 'branches', 'feat/twee', 'promptsPerModus')).toStrictEqual({
    plan: 1,
    onbekend: 1,
  });
  const gefilterd = cli(f, ['--json', '--sessie', 'sessie', '--branch', 'feat/twee']);
  expect(gefilterd.status).toBe(0);
  const value: unknown = JSON.parse(gefilterd.stdout);
  expect(value).toMatchObject({ sessies: { sessie: { prompts: 2, promptsPerModus: { plan: 1, onbekend: 1 } } } });
});

test('geregistreerde Read-denial telt eenmaal voor Pre plus Denied en bewaart geen geheiminhoud', () => {
  const f = fixture();
  const tool = {
    tool_name: 'Read',
    tool_use_id: 'read-geweigerd',
    tool_input: { file_path: '.env.local', content: 'GEHEIME_BESTANDSINHOUD' },
    tool_response: { content: 'GEHEIME_ANTWOORDTEKST' },
  };
  for (const hook_event_name of ['PreToolUse', 'PermissionDenied']) stuur(f, { hook_event_name, ...tool });

  expect(json(f)).toMatchObject({
    sessies: {
      sessie: {
        weigeringen: 1,
        weigeringenPerSleutel: { '.env.local': 1 },
        prompts: 0,
        branches: { 'feat/een': { weigeringen: 1, weigeringenPerSleutel: { '.env.local': 1 } } },
      },
    },
  });
  expect(log(f)).not.toMatch(/GEHEIME_BESTANDSINHOUD|GEHEIME_ANTWOORDTEKST|tool_input|tool_response/);
});
