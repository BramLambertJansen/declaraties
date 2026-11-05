import { execFileSync } from 'node:child_process';

// Een git-hook (pre-push → gate:fast) geeft GIT_DIR, GIT_INDEX_FILE e.d. door. In een worktree zijn die absoluut: een test die in een
// tijdelijke map `git init` of `git add -A` draait, schrijft dan in de echte repo (core.bare = true, fixtures in de index).
// Daarom haalt elke testworker de repo-variabelen van git weg; git noemt ze zelf met `rev-parse --local-env-vars`.
// Zonder git (de runner, ADR 0044) kan geen test via git in de repo schrijven: dan is er niets weg te halen.
function repoVariables(): string[] {
  try {
    return execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

for (const name of repoVariables()) Reflect.deleteProperty(process.env, name);

// Ook de samenvatting van de CI-job (meting-stuurt/AC-3): een test die `leespad` of `ratchet` start, zou anders de uitvoer van
// zijn fixture op de PR zetten. Een test die de samenvatting toetst, zet de variabele zelf.
Reflect.deleteProperty(process.env, 'GITHUB_STEP_SUMMARY');
