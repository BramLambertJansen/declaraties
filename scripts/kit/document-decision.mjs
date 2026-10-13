// De agent bereidt een besluit voor. Alleen de versie die de eigenaar naar main brengt is bevoegdheid.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { documentInfo, documentKind } from '../../.claude/hooks/lib/document-state.mjs';
import { readRegistry } from '../../.claude/hooks/lib/task-authority.mjs';
import { gitText, repositoryName, safeRepositoryPath } from '../../.claude/hooks/lib/authority-context.mjs';

/** @param {string[]} args */
function argumentsFor(args) {
  const [file, status, ...flags] = args;
  if (file === undefined || status === undefined || flags.length % 2 !== 0)
    throw new Error('Gebruik: pnpm docs:decision <document> <status> --branch <bouwbranch> [--path <bestand>]');
  let branch = '';
  const paths = [];
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1] ?? '';
    if (flag === '--branch' && branch === '') branch = value;
    else if (flag === '--path') paths.push(value);
    else throw new Error('Onbekende of dubbele optie voor het besluit');
  }
  return { file, status, branch, paths };
}

async function main() {
  const root = process.cwd();
  const target = argumentsFor(process.argv.slice(2));
  if (documentKind(target.file) === null) throw new Error('Alleen een spec- of ADR-document is toegestaan');
  if (!safeRepositoryPath(root, target.file) || !safeRepositoryPath(root, '.claude/decisions.json'))
    throw new Error('Onveilig document- of besluitenpad');
  const info = documentInfo(target.file, readFileSync(path.join(root, target.file), 'utf8'));
  if (info === null) throw new Error('Ongeldige spec of ADR');
  const repository = repositoryName(gitText(root, ['config', '--get', 'remote.origin.url'])?.trim() ?? '');
  if (repository === null) throw new Error('Repository-identiteit niet leesbaar');
  const registryFile = path.join(root, '.claude/decisions.json');
  const registry = readRegistry(readFileSync(registryFile, 'utf8'));
  const entry = { ...target, digest: info.digest, repository };
  const decisions = registry.decisions.filter(
    (decision) =>
      decision.file !== entry.file || decision.branch !== entry.branch || decision.repository !== entry.repository,
  );
  const next = readRegistry(JSON.stringify({ ...registry, decisions: [...decisions, entry] }));
  writeFileSync(registryFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${target.file}: besluitvoorstel voorbereid; geen rechten actief vóór eigenaarreview en merge naar main`);
}

if (import.meta.main)
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
