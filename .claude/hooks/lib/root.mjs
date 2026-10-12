// De root waarin een hook werkt, voor het rolhek en de werkstraat-hooks (framework §8, ADR 0016 gevolgen).
import { execFileSync } from 'node:child_process';

/**
 * `cwd` uit de hook-payload; zonder (of bij een lege payload) de map waarin de hook draait.
 * @param {unknown} payload
 */
export function payloadCwd(payload) {
  return typeof payload === 'object' && payload !== null && 'cwd' in payload && typeof payload.cwd === 'string'
    ? payload.cwd
    : process.cwd();
}

/**
 * De root van de worktree waarin de sessie werkt, niet CLAUDE_PROJECT_DIR: in een worktree onder .claude/worktrees/ zou elk
 * pad anders onder de gate `.claude/**` vallen, de gates.json van de branch zelf niet gelden, en draaiden lint en gate:fast
 * op de hoofdmap in plaats van op de gewijzigde code. Alleen buiten git valt hij terug op CLAUDE_PROJECT_DIR en daarna op
 * `fallback`; zonder beide gooit hij de fout van git door (het rolhek faalt dan dicht).
 * @param {string} cwd
 * @param {string} [fallback]
 */
export function projectRoot(cwd, fallback) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (error) {
    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? fallback;
    if (projectDir === undefined) throw error;
    return projectDir;
  }
}
