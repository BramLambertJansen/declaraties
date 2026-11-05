import { expect, test } from 'vitest';
import { describeDevice } from './user-agent.ts';

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';

test.each([
  ['FxiOS/131.0 Mobile/15E148 Safari/605.1.15', 'Firefox op iOS'],
  ['CriOS/131.0.6778.31 Mobile/15E148 Safari/604.1', 'Chrome op iOS'],
  ['EdgiOS/131.0 Mobile/15E148 Safari/605.1.15', 'Edge op iOS'],
  ['Version/18.0 Mobile/15E148 Safari/604.1', 'Safari op iOS'],
])('herkent de browser in een iOS-user-agent: %s', (browser, expected) => {
  expect(describeDevice(`${IOS} ${browser}`)).toBe(expected);
});
