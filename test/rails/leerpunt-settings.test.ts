import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { TEMPLATE_REPOSITORY } from '../../rails/hooks/lib/task-authority.mjs';

// Spec leerlus (docs/specs/leerlus.md) AC-8, ADR 0059 punt 3. Exacte vorm van de allow-regel in .claude/settings.json:
//
//   "Bash(gh issue create --repo <onderhoud.repository> --label leerpunt *)"
//
// met <onderhoud.repository> letterlijk de waarde uit .claude/gates.json (in een app zonder die regel: TEMPLATE_REPOSITORY). Geen andere allow-regel mag een
// `gh issue create` dekken (ook geen `Bash(gh *)`, `Bash(gh issue *)` of de oude vorm `Bash(gh issue create:*)`).

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function child(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
const allow = strings(child(child(settings, 'permissions'), 'allow'));
const repoValue = child(child(gates, 'onderhoud'), 'repository');
// In een app verwijdert `pnpm app:init` de onderhoud-regel (ADR 0045 punt 8); de allow-regel moet dan naar de template wijzen.
const REPO = typeof repoValue === 'string' ? repoValue : TEMPLATE_REPOSITORY;
const RULE = `Bash(gh issue create --repo ${REPO} --label leerpunt *)`;

/** Bash-permissieregel als regex: `*` is willekeurige tekst, een afsluitende `:*` is een prefix (oude vorm). */
function matcher(rule: string): RegExp | null {
  const body = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  if (body === undefined) return null;
  const prefix = body.endsWith(':*');
  const pattern = (prefix ? body.slice(0, -2) : body)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}${prefix ? '(?:\\s.*)?' : ''}$`, 's');
}

const coveredBy = (command: string): string[] => allow.filter((rule) => matcher(rule)?.test(command) === true);

describe('settings: allow-regel voor leerpunten', () => {
  test('leerlus/AC-8: precies één allow-regel in de exacte vorm, met de repo uit onderhoud.repository', () => {
    expect(REPO).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(allow.filter((rule) => rule === RULE)).toStrictEqual([RULE]);
    expect(allow.filter((rule) => rule.includes('gh issue create'))).toStrictEqual([RULE]);
  });

  test('leerlus/AC-8: de juiste vorm valt alleen onder die regel', () => {
    expect(coveredBy(`gh issue create --repo ${REPO} --label leerpunt --title "Leerpunt: x" --body y`)).toStrictEqual([
      RULE,
    ]);
  });

  test.each([
    { name: 'zonder repo en label', command: 'gh issue create --title x --body y' },
    { name: 'andere repo', command: 'gh issue create --repo iemand/anders --label leerpunt --title x' },
    { name: 'ander label', command: `gh issue create --repo ${REPO} --label bug --title x` },
    { name: '-R in plaats van --repo', command: `gh issue create -R ${REPO} --label leerpunt --title x` },
    { name: 'label vóór repo', command: `gh issue create --label leerpunt --repo ${REPO} --title x` },
  ])('leerlus/AC-8: $name valt onder geen enkele allow-regel', ({ command }) => {
    expect(allow.length).toBeGreaterThan(0);
    expect(coveredBy(command)).toStrictEqual([]);
  });
});
