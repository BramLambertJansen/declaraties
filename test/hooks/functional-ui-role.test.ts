import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { TEMPLATE_REPOSITORY } from '../../rails/hooks/lib/task-authority.mjs';

const FILE = 'src/core/web/ui/toast.tsx';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const files: Record<string, string> = { [FILE]: 'export const version = 1;\n' };

function write(repository: string) {
  return decide(
    {
      agent_type: 'developer',
      tool_name: 'Write',
      tool_input: { file_path: `/repo/${FILE}`, content: 'export const version = 2;\n' },
    },
    {
      root: '/repo',
      cwd: '/repo',
      config,
      read: (file) => files[file] ?? null,
      committed: () => false,
      isDir: () => false,
      branch: 'fix/toasts',
      authority: {
        registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
        repository,
        branch: 'fix/toasts',
        trusted: (file) => files[file] ?? null,
        working: (file) => files[file] ?? null,
        safe: () => true,
      },
    },
  );
}

test('ADR 0056: de bekende developer krijgt in de template de UI-scope als reviewmelding, zonder mandaatrecord', () => {
  const result = write(TEMPLATE_REPOSITORY);

  expect(result.ask).toEqual([]);
  expect(result.deny).toEqual([]);
  expect(result.context.join('\n')).toContain('functionele UI (ADR 0056)');
  expect(result.context.join('\n')).toContain('scope worden in CI');
});

test('ADR 0056: dezelfde bronactie geeft in een app geen UI-uitzondering; check-core en de lane blijven verantwoordelijk', () => {
  expect(write('owner/app').context.join('\n')).not.toContain('functionele UI (ADR 0056)');
});
