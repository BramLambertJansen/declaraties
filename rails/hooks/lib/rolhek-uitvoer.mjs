// Uitvoer van het rolhek (spec rolhek-dicht AC-4): met `onFailure: "block"` is ongeldige uitvoer ook een storing, dus alleen
// exit 0 of 2, en stdout leeg of één JSON-object met de PreToolUse-velden uit de Claude Code-docs.

/**
 * @param {{ deny: string[], ask: string[], context: string[], allow?: boolean }} decision
 * @returns {{ exitCode: 0 | 2, stdout: string, stderr: string }}
 */
export function uitvoer(decision) {
  if (decision.deny.length > 0) return { exitCode: 2, stdout: '', stderr: `rolhek: ${decision.deny.join('\nrolhek: ')}\n` };
  const output = {
    hookEventName: 'PreToolUse',
    ...(decision.ask.length > 0
      ? { permissionDecision: 'ask', permissionDecisionReason: decision.ask.join('; ') }
      : decision.allow === true
        ? { permissionDecision: 'allow' }
        : {}),
    ...(decision.context.length > 0 ? { additionalContext: decision.context.join('\n') } : {}),
  };
  return { exitCode: 0, stdout: Object.keys(output).length > 1 ? JSON.stringify({ hookSpecificOutput: output }) : '', stderr: '' };
}
