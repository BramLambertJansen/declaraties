// ADR 0056: één begrensde UI-uitzondering. Een marker beschrijft de bedoeling; de paden en eigenaarreview bepalen de scope.
import { canonicalPath, TEMPLATE_REPOSITORY } from './task-authority.mjs';

/** @typedef {{ status: string, pad: string, van?: string }} UiChange */

/** Alleen een echt frontmatterveld, nooit een vermelding in de body. @param {string} text @param {string} value */
function frontmatterHas(text, value) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.indexOf('---', 1);
  return lines[0] === '---' && end > 0 && lines.slice(1, end).includes(value);
}

/** @param {string} text */
export function isFunctionalUiSpec(text) {
  return frontmatterHas(text, 'sjabloon: mini') && frontmatterHas(text, 'scope: functionele-ui');
}

/** @param {string} file */
export function isCoreUiSource(file) {
  return canonicalPath(file) && /^src\/core\/web\/(?:ui|copy)\/.+\.(?:ts|tsx)$/.test(file) && !/\.(?:test|spec)\./.test(file);
}

/** @param {string} file */
export function isUiTest(file) {
  return canonicalPath(file) && (
    /^src\/(?:core\/web\/(?:ui|copy)|web\/(?:ui|copy|features|routes))\/.+\.(?:test|spec)\.tsx?$/.test(file) ||
    /^e2e\/[^/]+\.spec\.ts$/.test(file) || /^test\/ui\/[^/]+\.test\.ts$/.test(file)
  );
}

/** @param {string} file */
function isUiSource(file) {
  return isCoreUiSource(file) || (/^src\/web\/(?:ui|copy|features|routes)\/.+\.(?:ts|tsx|css)$/.test(file) &&
    !/\.(?:test|spec|gen)\./.test(file) && !file.endsWith('/queries.ts'));
}

/** @param {UiChange} change @param {string} spec */
function invalidUiPath({ status, pad }, spec) {
  if (!canonicalPath(pad) || /(?:^|\/)(?:AGENTS|CLAUDE)[^/]*\.md$/.test(pad) || status === 'T') return `${pad}: onveilig UI-pad`;
  if (isUiTest(pad)) return ['A', 'M'].includes(status) ? null : `${pad}: bestaande UI-tests alleen toevoegen of wijzigen`;
  if (isUiSource(pad)) return null;
  if (pad === spec || pad === 'CHANGELOG.md' || /^docs\/(?!adr\/|specs\/).+\.md$/.test(pad)) return null;
  return `${pad}: buiten functionele UI (ADR 0056)`;
}

/** @param {{ changes: UiChange[], repository?: string | undefined, spec: string }} input */
export function functionalUiReason({ changes, repository, spec }) {
  if (repository !== TEMPLATE_REPOSITORY) return 'functionele core-UI is uitsluitend toegestaan in de template-repository';
  const paths = changes.flatMap(({ status, pad, van }) => van === undefined ? [{ status, pad }] : [{ status, pad }, { status, pad: van }]);
  const invalid = paths.map((change) => invalidUiPath(change, spec)).find((reason) => reason !== null);
  if (invalid !== undefined) return invalid;
  return paths.some(({ pad }) => isUiSource(pad) && !isUiTest(pad)) ? null : 'functionele UI vraagt een bijbehorende bronwijziging';
}

// Dezelfde bestaande heuristiek als het rolhek; inhoudelijke testkwaliteit blijft onderdeel van eigenaarreview.
const SKIP = /\.(?:skip|todo|fixme)\s*\(|\b(?:xit|xtest|xdescribe)\s*\(|\bskip\s*\(/g;
const CASES = /\b(?:test|it)(?:\.each\b[^(]*\([^)]*\))?\s*\(/g;

/** @param {string} before @param {string} after */
export function testChangeRisk(before, after) {
  const count = (/** @type {string} */ text, /** @type {RegExp} */ pattern) => (text.match(pattern) ?? []).length;
  if (count(after, SKIP) > count(before, SKIP)) return 'skip';
  return count(after, CASES) < count(before, CASES) ? 'removed' : null;
}
