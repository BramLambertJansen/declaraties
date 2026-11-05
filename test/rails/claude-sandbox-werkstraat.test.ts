import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Dit bewijst alleen configuratie; native Claude, hooks en GitHub vergen afzonderlijk echt bewijs in de PR.
function section(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? Object.fromEntries(Object.entries(value)) : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const settings = section(JSON.parse(readFileSync('.claude/settings.json', 'utf8')));
const permissions = section(settings['permissions']);
const allow = strings(permissions['allow']);
const sandbox = section(settings['sandbox']);
const filesystem = section(sandbox['filesystem']);
// Vastgelegd vóór implementatie vanaf de geaccepteerde ontwerpbaseline; geen runtime-baseline uit de gewijzigde settings.
const boundaries = section(
  JSON.parse(readFileSync('test/rails/fixtures/claude-sandbox-werkstraat/boundaries.json', 'utf8')),
);

// claude-sandbox-werkstraat/AC-7: verplichte sandbox en bestaande toestemmingsgrenzen blijven ingesteld.
test('sandbox voert gewone Bash expliciet automatisch uit binnen de bestaande verplichte grens', () => {
  expect(sandbox['autoAllowBashIfSandboxed']).toBe(true);
  expect(sandbox['enabled']).toBe(true);
  expect(sandbox['failIfUnavailable']).toBe(true);
  expect(sandbox['allowUnsandboxedCommands']).toBe(false);
  expect(permissions['disableBypassPermissionsMode']).toBe('disable');
  expect(permissions['defaultMode']).toBe('acceptEdits');
});

// claude-sandbox-werkstraat/AC-3 en claude-sandbox-werkstraat/AC-4 (configdeel): gerichte Git-toestemmingen.
// Dit voert geen native commit, pre-push of GitHub-opdracht uit; dat bewijs hoort afzonderlijk in de PR.
test.each(['Bash(git add *)', 'Bash(git commit *)', 'Bash(git push origin HEAD)'])(
  'gerichte gewone werkopdracht krijgt toestemming: %s',
  (rule) => {
    expect(allow).toContain(rule);
  },
);

test.each(['create', 'view', 'list', 'diff', 'checks'])('gh pr %s blijft gericht toegestaan', (action) => {
  expect(allow).toContain(`Bash(gh pr ${action} *)`);
});

// claude-sandbox-werkstraat/AC-5 (configdeel): geen brede Git-rechten of nieuwe upstream-toestemming.
// De echte proef in hoofdcheckout en gekoppelde worktree blijft afzonderlijk native bewijs in de PR.
test('geen brede Git-, gh- of upstream-toestemming bij de dagelijkse HEAD-push', () => {
  const broad = ['Bash(git *)', 'Bash(git push *)', 'Bash(gh *)', 'Bash(gh pr *)'];
  expect(allow.filter((rule) => broad.includes(rule))).toEqual([]);
  expect(allow.filter((rule) => /^Bash\(git push .*(?: -u|--set-upstream)/.test(rule))).toEqual([]);
});

test('deny en ask blijven ongewijzigd naast de gerichte nieuwe allows', () => {
  expect(permissions['deny']).toEqual(boundaries['deny']);
  expect(permissions['ask']).toEqual(boundaries['ask']);
});

test('alleen bestaande runneruitzonderingen, zonder generieke pnpm- of Git-uitsluiting', () => {
  expect(sandbox['excludedCommands']).toEqual(boundaries['excludedCommands']);
});

test('netwerk en leesgrens blijven gelijk; alleen de bewezen gh-cache kan extra schrijfbaar worden', () => {
  expect(sandbox['network']).toEqual(boundaries['network']);
  expect(filesystem['allowRead']).toEqual(boundaries['allowRead']);
  expect(filesystem['denyRead']).toEqual(boundaries['denyRead']);
  expect([[], ['~/.cache/gh']]).toContainEqual(filesystem['allowWrite'] ?? []);
});

// claude-sandbox-werkstraat/AC-8 (configdeel): supplychain en verifyDepsBeforeRun blijven bytegelijk ingesteld.
// Het echte run/exec-weigergedrag staat in test/scripts/dependency-readiness.test.ts.
test('supplychain en weigering van een afwijkende installatie blijven intact', () => {
  expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toBe(boundaries['workspace']);
});
