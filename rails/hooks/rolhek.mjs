// PreToolUse-hook "rolhek" (framework §8, ADR 0045), voor Edit/Write/MultiEdit/NotebookEdit/Bash en mcp__* van elke rol.
// deny → exit 2 met de reden op stderr (Claude ziet hem); ask → de eigenaar kiest; anders door, eventueel met context.
// Faalt dicht: een interne fout is exit 2 (een hook die crasht mag niets doorlaten). Wat tekstheuristiek niet vangt,
// vangt de diff-guard in CI.
import { readFileSync } from 'node:fs';
import { decide } from './lib/rolhek.mjs';
import { rolhekContext } from './lib/rolhek-context.mjs';
import { payloadCwd, projectRoot } from './lib/root.mjs';

function main() {
  /** @type {unknown} */
  const payload = JSON.parse(readFileSync(0, 'utf8'));
  const cwd = payloadCwd(payload);
  // Niet CLAUDE_PROJECT_DIR maar de git-root van cwd: zie lib/root.mjs.
  const root = projectRoot(cwd);
  const decision = decide(payload, rolhekContext(root, cwd));
  if (decision.deny.length > 0) {
    process.stderr.write(`rolhek: ${decision.deny.join('\nrolhek: ')}\n`);
    process.exit(2);
  }
  const output = {
    hookEventName: 'PreToolUse',
    ...(decision.ask.length > 0
      ? {
          permissionDecision: 'ask',
          permissionDecisionReason: decision.ask.join('; '),
        }
      : decision.allow === true ? { permissionDecision: 'allow' } : {}),
    ...(decision.context.length > 0 ? { additionalContext: decision.context.join('\n') } : {}),
  };
  if (Object.keys(output).length > 1) process.stdout.write(JSON.stringify({ hookSpecificOutput: output }));
}

try {
  main();
} catch (error) {
  process.stderr.write(
    `rolhek: interne fout, daarom geweigerd: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
}
